import { WebDemuxer } from "web-demuxer";
import type { AudioRegion, SpeedRegion, TrimRegion } from "@/components/video-editor/types";
import { resolveMediaElementSource } from "./localMediaSource";
import type { VideoMuxer } from "./muxer";

const AUDIO_BITRATE = 128_000;
const DECODE_BACKPRESSURE_LIMIT = 20;
const ENCODE_BACKPRESSURE_LIMIT = 20;
const MIN_SPEED_REGION_DELTA_MS = 0.0001;
const MP4_AUDIO_CODEC = "mp4a.40.2";

export class AudioProcessor {
	private cancelled = false;

	/**
	 * Audio export has two modes:
	 * 1) no speed regions -> fast WebCodecs trim-only pipeline
	 * 2) speed regions present -> pitch-preserving rendered timeline pipeline
	 */
	async process(
		demuxer: WebDemuxer | null,
		muxer: VideoMuxer,
		videoUrl: string,
		trimRegions?: TrimRegion[],
		speedRegions?: SpeedRegion[],
		readEndSec?: number,
		audioRegions?: AudioRegion[],
		sourceAudioFallbackPaths?: string[],
	): Promise<void> {
		const sortedTrims = trimRegions ? [...trimRegions].sort((a, b) => a.startMs - b.startMs) : [];
		const sortedSpeedRegions = speedRegions
			? [...speedRegions]
					.filter((region) => region.endMs - region.startMs > MIN_SPEED_REGION_DELTA_MS)
					.sort((a, b) => a.startMs - b.startMs)
			: [];
		const sortedAudioRegions = audioRegions
			? [...audioRegions].sort((a, b) => a.startMs - b.startMs)
			: [];
		const sortedSourceAudioFallbackPaths = sourceAudioFallbackPaths
			? sourceAudioFallbackPaths.filter(
					(audioPath) => typeof audioPath === "string" && audioPath.trim().length > 0,
				)
			: [];

		// When audio regions or speed edits are present, use AudioContext mixing path.
		if (
			sortedSpeedRegions.length > 0 ||
			sortedAudioRegions.length > 0 ||
			sortedSourceAudioFallbackPaths.length > 0
		) {
			const renderedAudioBlob = await this.renderMixedTimelineAudio(
				videoUrl,
				sortedTrims,
				sortedSpeedRegions,
				sortedAudioRegions,
				sortedSourceAudioFallbackPaths,
			);
			if (!this.cancelled) {
				await this.muxRenderedAudioBlob(renderedAudioBlob, muxer);
				return;
			}
		}

		// No speed edits or audio regions: keep the original demux/decode/encode path with trim timestamp remap.
		if (!demuxer) {
			console.warn("[AudioProcessor] No demuxer available, skipping audio");
			return;
		}

		await this.processTrimOnlyAudio(demuxer, muxer, sortedTrims, readEndSec);
	}

	// Legacy trim-only path used when no speed regions are configured.
	private async processTrimOnlyAudio(
		demuxer: WebDemuxer,
		muxer: VideoMuxer,
		sortedTrims: TrimRegion[],
		readEndSec?: number,
	): Promise<void> {
		let audioConfig: AudioDecoderConfig;
		try {
			audioConfig = (await demuxer.getDecoderConfig("audio")) as AudioDecoderConfig;
		} catch {
			console.warn("[AudioProcessor] No audio track found, skipping");
			return;
		}

		const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
		if (!codecCheck.supported) {
			console.warn("[AudioProcessor] Audio codec not supported:", audioConfig.codec);
			return;
		}

		const audioStream =
			typeof readEndSec === "number" ? demuxer.read("audio", 0, readEndSec) : demuxer.read("audio");

		await this.transcodeAudioStream(
			audioStream as ReadableStream<EncodedAudioChunk>,
			audioConfig,
			muxer,
			{
				shouldSkipChunk: (timestampMs) => this.isInTrimRegion(timestampMs, sortedTrims),
				transformAudioData: (data) => {
					const timestampMs = data.timestamp / 1000;
					const trimOffsetMs = this.computeTrimOffset(timestampMs, sortedTrims);
					const adjustedTimestampUs = data.timestamp - trimOffsetMs * 1000;
					return this.cloneWithTimestamp(data, Math.max(0, adjustedTimestampUs));
				},
			},
		);
	}

	private async transcodeAudioStream(
		audioStream: ReadableStream<EncodedAudioChunk>,
		audioConfig: AudioDecoderConfig,
		muxer: VideoMuxer,
		options: {
			shouldSkipChunk?: (timestampMs: number) => boolean;
			transformAudioData?: (data: AudioData) => AudioData | null;
		} = {},
	): Promise<void> {
		const pendingFrames: AudioData[] = [];
		let decodeError: Error | null = null;
		let encodeError: Error | null = null;
		let muxError: Error | null = null;
		let pendingMuxing = Promise.resolve();

		const failIfNeeded = () => {
			if (decodeError) throw decodeError;
			if (encodeError) throw encodeError;
			if (muxError) throw muxError;
		};

		const pumpEncodedFrames = () => {
			while (!this.cancelled && pendingFrames.length > 0) {
				if (encodeError || muxError) {
					break;
				}
				if (encoder.encodeQueueSize >= ENCODE_BACKPRESSURE_LIMIT) {
					break;
				}

				const frame = pendingFrames.shift();
				if (!frame) {
					break;
				}

				encoder.encode(frame);
				frame.close();
			}
		};

		const cleanupPendingFrames = () => {
			for (const frame of pendingFrames) {
				frame.close();
			}
			pendingFrames.length = 0;
		};

		const sampleRate = audioConfig.sampleRate || 48_000;
		const channels = audioConfig.numberOfChannels || 2;
		const encodeConfig: AudioEncoderConfig = {
			codec: MP4_AUDIO_CODEC,
			sampleRate,
			numberOfChannels: channels,
			bitrate: AUDIO_BITRATE,
		};

		const encodeSupport = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!encodeSupport.supported) {
			console.warn("[AudioProcessor] AAC encoding not supported, skipping audio");
			return;
		}

		const encoder = new AudioEncoder({
			output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
				pendingMuxing = pendingMuxing
					.then(async () => {
						if (this.cancelled) {
							return;
						}
						await muxer.addAudioChunk(chunk, meta);
					})
					.catch((error) => {
						muxError = error instanceof Error ? error : new Error(String(error));
					});
			},
			error: (error: DOMException) => {
				encodeError = new Error(`[AudioProcessor] Encode error: ${error.message}`);
			},
		});

		encoder.configure(encodeConfig);

		const decoder = new AudioDecoder({
			output: (data: AudioData) => {
				if (this.cancelled || encodeError || muxError) {
					data.close();
					return;
				}

				const transformed = options.transformAudioData ? options.transformAudioData(data) : data;

				if (transformed !== data) {
					data.close();
				}

				if (!transformed) {
					return;
				}

				pendingFrames.push(transformed);
			},
			error: (error: DOMException) => {
				decodeError = new Error(`[AudioProcessor] Decode error: ${error.message}`);
			},
		});
		decoder.configure(audioConfig);

		const reader = audioStream.getReader();

		try {
			while (!this.cancelled) {
				failIfNeeded();

				const { done, value: chunk } = await reader.read();
				if (done || !chunk) break;

				const timestampMs = chunk.timestamp / 1000;
				if (options.shouldSkipChunk?.(timestampMs)) continue;

				decoder.decode(chunk);
				pumpEncodedFrames();

				while (
					!this.cancelled &&
					(decoder.decodeQueueSize > DECODE_BACKPRESSURE_LIMIT ||
						pendingFrames.length > DECODE_BACKPRESSURE_LIMIT ||
						encoder.encodeQueueSize >= ENCODE_BACKPRESSURE_LIMIT)
				) {
					failIfNeeded();
					pumpEncodedFrames();
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}

			if (decoder.state === "configured") {
				await decoder.flush();
			}

			while (!this.cancelled && (pendingFrames.length > 0 || encoder.encodeQueueSize > 0)) {
				failIfNeeded();
				pumpEncodedFrames();
				if (pendingFrames.length > 0 || encoder.encodeQueueSize > 0) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}

			failIfNeeded();

			if (encoder.state === "configured") {
				await encoder.flush();
			}

			await pendingMuxing;
			failIfNeeded();
		} finally {
			try {
				await reader.cancel();
			} catch {
				// reader already closed
			}

			cleanupPendingFrames();

			if (decoder.state === "configured") {
				decoder.close();
			}

			if (encoder.state === "configured") {
				encoder.close();
			}
		}

		if (this.cancelled) {
			return;
		}
	}

	// Renders mixed audio: original video audio (with speed/trim) + external audio regions.
	// Uses AudioContext to mix all sources into a single recorded stream.
	private async renderMixedTimelineAudio(
		videoUrl: string,
		trimRegions: TrimRegion[],
		speedRegions: SpeedRegion[],
		audioRegions: AudioRegion[],
		sourceAudioFallbackPaths: string[] = [],
	): Promise<Blob> {
		const timelineMediaSource = await resolveMediaElementSource(videoUrl);
		const timelineMedia = document.createElement("video");
		timelineMedia.src = timelineMediaSource.src;
		timelineMedia.preload = "auto";
		timelineMedia.playsInline = true;

		const pitchMedia = timelineMedia as HTMLMediaElement & {
			preservesPitch?: boolean;
			mozPreservesPitch?: boolean;
			webkitPreservesPitch?: boolean;
		};
		pitchMedia.preservesPitch = true;
		pitchMedia.mozPreservesPitch = true;
		pitchMedia.webkitPreservesPitch = true;

		await this.waitForLoadedMetadata(timelineMedia);
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}

		const audioContext = new AudioContext();
		const destinationNode = audioContext.createMediaStreamDestination();

		let timelineAudioSourceNode: MediaElementAudioSourceNode | null = null;
		if (sourceAudioFallbackPaths.length === 0) {
			timelineAudioSourceNode = audioContext.createMediaElementSource(timelineMedia);
			timelineAudioSourceNode.connect(destinationNode);
		}

		const sourceAudioElements: {
			media: HTMLAudioElement;
			sourceNode: MediaElementAudioSourceNode;
			cleanup: () => void;
		}[] = [];

		for (const sourceAudioPath of sourceAudioFallbackPaths) {
			const sourceFileSource = await resolveMediaElementSource(sourceAudioPath);
			const audioEl = document.createElement("audio");
			audioEl.src = sourceFileSource.src;
			audioEl.preload = "auto";
			try {
				await this.waitForLoadedMetadata(audioEl);
			} catch {
				sourceFileSource.revoke();
				console.warn("[AudioProcessor] Failed to load source audio fallback:", sourceAudioPath);
				continue;
			}
			if (this.cancelled) throw new Error("Export cancelled");

			const sourceNode = audioContext.createMediaElementSource(audioEl);
			sourceNode.connect(destinationNode);

			sourceAudioElements.push({
				media: audioEl,
				sourceNode,
				cleanup: sourceFileSource.revoke,
			});
		}

		// Prepare external audio region elements
		const audioRegionElements: {
			media: HTMLAudioElement;
			sourceNode: MediaElementAudioSourceNode;
			gainNode: GainNode;
			region: AudioRegion;
			cleanup: () => void;
		}[] = [];

		for (const region of audioRegions) {
			const regionFileSource = await resolveMediaElementSource(region.audioPath);
			const audioEl = document.createElement("audio");
			audioEl.src = regionFileSource.src;
			audioEl.preload = "auto";
			try {
				await this.waitForLoadedMetadata(audioEl);
			} catch {
				regionFileSource.revoke();
				console.warn("[AudioProcessor] Failed to load audio region:", region.audioPath);
				continue;
			}
			if (this.cancelled) throw new Error("Export cancelled");

			const regionSourceNode = audioContext.createMediaElementSource(audioEl);
			const gainNode = audioContext.createGain();
			gainNode.gain.value = Math.max(0, Math.min(1, region.volume));
			regionSourceNode.connect(gainNode);
			gainNode.connect(destinationNode);

			audioRegionElements.push({
				media: audioEl,
				sourceNode: regionSourceNode,
				gainNode,
				region,
				cleanup: regionFileSource.revoke,
			});
		}

		const { recorder, recordedBlobPromise } = this.startAudioRecording(destinationNode.stream);
		let rafId: number | null = null;

		try {
			if (audioContext.state === "suspended") {
				await audioContext.resume();
			}

			await this.seekTo(timelineMedia, 0);
			await timelineMedia.play();

			await new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					if (rafId !== null) {
						cancelAnimationFrame(rafId);
						rafId = null;
					}
					timelineMedia.removeEventListener("error", onError);
					timelineMedia.removeEventListener("ended", onEnded);
				};

				const onError = () => {
					cleanup();
					reject(new Error("Failed while rendering mixed audio timeline"));
				};

				const onEnded = () => {
					cleanup();
					resolve();
				};

				const tick = () => {
					if (this.cancelled) {
						cleanup();
						resolve();
						return;
					}

					let currentTimeMs = timelineMedia.currentTime * 1000;
					const activeTrimRegion = this.findActiveTrimRegion(currentTimeMs, trimRegions);

					if (activeTrimRegion && !timelineMedia.paused && !timelineMedia.ended) {
						const skipToTime = activeTrimRegion.endMs / 1000;
						if (skipToTime >= timelineMedia.duration) {
							timelineMedia.pause();
							cleanup();
							resolve();
							return;
						}
						timelineMedia.currentTime = skipToTime;
						currentTimeMs = skipToTime * 1000;
					}

					const activeSpeedRegion = this.findActiveSpeedRegion(currentTimeMs, speedRegions);
					const playbackRate = activeSpeedRegion ? activeSpeedRegion.speed : 1;
					if (Math.abs(timelineMedia.playbackRate - playbackRate) > 0.0001) {
						timelineMedia.playbackRate = playbackRate;
					}

					for (const entry of sourceAudioElements) {
						const audioEl = entry.media;
						const targetTimeSec = Math.max(
							0,
							Math.min(
								currentTimeMs / 1000,
								Number.isFinite(audioEl.duration) ? audioEl.duration : currentTimeMs / 1000,
							),
						);

						if (Math.abs(audioEl.playbackRate - playbackRate) > 0.0001) {
							audioEl.playbackRate = playbackRate;
						}

						const atEnd = Number.isFinite(audioEl.duration) && targetTimeSec >= audioEl.duration;
						if (atEnd) {
							if (!audioEl.paused) {
								audioEl.pause();
							}
							continue;
						}

						if (audioEl.paused) {
							audioEl.currentTime = targetTimeSec;
							audioEl.play().catch(() => {});
						} else if (Math.abs(audioEl.currentTime - targetTimeSec) > 0.3) {
							audioEl.currentTime = targetTimeSec;
						}
					}

					// Sync external audio regions with the video timeline position
					for (const entry of audioRegionElements) {
						const { media: audioEl, region } = entry;
						const isInRegion = currentTimeMs >= region.startMs && currentTimeMs < region.endMs;

						if (isInRegion) {
							const audioOffset = (currentTimeMs - region.startMs) / 1000;
							if (audioEl.paused) {
								audioEl.currentTime = audioOffset;
								audioEl.play().catch(() => {});
							} else if (Math.abs(audioEl.currentTime - audioOffset) > 0.3) {
								audioEl.currentTime = audioOffset;
							}
						} else {
							if (!audioEl.paused) {
								audioEl.pause();
							}
						}
					}

					if (!timelineMedia.paused && !timelineMedia.ended) {
						rafId = requestAnimationFrame(tick);
					} else {
						cleanup();
						resolve();
					}
				};

				timelineMedia.addEventListener("error", onError, { once: true });
				timelineMedia.addEventListener("ended", onEnded, { once: true });
				rafId = requestAnimationFrame(tick);
			});
		} finally {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
			timelineMedia.pause();
			timelineAudioSourceNode?.disconnect();
			timelineMedia.src = "";
			timelineMedia.load();
			timelineMediaSource.revoke();
			for (const entry of sourceAudioElements) {
				entry.media.pause();
				entry.sourceNode.disconnect();
				entry.media.src = "";
				entry.media.load();
				entry.cleanup();
			}
			for (const entry of audioRegionElements) {
				entry.media.pause();
				entry.sourceNode.disconnect();
				entry.gainNode.disconnect();
				entry.media.src = "";
				entry.media.load();
				entry.cleanup();
			}
			if (recorder.state !== "inactive") {
				recorder.stop();
			}
			destinationNode.stream.getTracks().forEach((track) => track.stop());
			timelineAudioSourceNode?.disconnect();
			destinationNode.disconnect();
			await audioContext.close();
			timelineMedia.src = "";
			timelineMedia.load();
			timelineMediaSource.revoke();
		}

		const recordedBlob = await recordedBlobPromise;
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}
		return recordedBlob;
	}

	// Demuxes the rendered speed-adjusted blob, decodes it, and re-encodes it to AAC for MP4 output.
	private async muxRenderedAudioBlob(blob: Blob, muxer: VideoMuxer): Promise<void> {
		if (this.cancelled) return;

		const file = new File([blob], "speed-audio.webm", { type: blob.type || "audio/webm" });
		const wasmUrl = new URL("./wasm/web-demuxer.wasm", window.location.href).href;
		const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });

		try {
			await demuxer.load(file);
			const audioConfig = (await demuxer.getDecoderConfig("audio")) as AudioDecoderConfig;
			const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
			if (!codecCheck.supported) {
				console.warn("[AudioProcessor] Rendered audio codec not supported:", audioConfig.codec);
				return;
			}

			await this.transcodeAudioStream(
				demuxer.read("audio") as ReadableStream<EncodedAudioChunk>,
				audioConfig,
				muxer,
			);
		} finally {
			try {
				demuxer.destroy();
			} catch {
				// ignore
			}
		}
	}

	private startAudioRecording(stream: MediaStream): {
		recorder: MediaRecorder;
		recordedBlobPromise: Promise<Blob>;
	} {
		const mimeType = this.getSupportedAudioMimeType();
		const options: MediaRecorderOptions = {
			audioBitsPerSecond: AUDIO_BITRATE,
			...(mimeType ? { mimeType } : {}),
		};

		const recorder = new MediaRecorder(stream, options);
		const chunks: Blob[] = [];

		const recordedBlobPromise = new Promise<Blob>((resolve, reject) => {
			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) {
					chunks.push(event.data);
				}
			};
			recorder.onerror = () => {
				reject(new Error("MediaRecorder failed while capturing speed-adjusted audio"));
			};
			recorder.onstop = () => {
				const type = mimeType || chunks[0]?.type || "audio/webm";
				resolve(new Blob(chunks, { type }));
			};
		});

		recorder.start();
		return { recorder, recordedBlobPromise };
	}

	private getSupportedAudioMimeType(): string | undefined {
		const candidates = ["audio/webm;codecs=opus", "audio/webm"];
		for (const candidate of candidates) {
			if (MediaRecorder.isTypeSupported(candidate)) {
				return candidate;
			}
		}
		return undefined;
	}

	private waitForLoadedMetadata(media: HTMLMediaElement): Promise<void> {
		if (Number.isFinite(media.duration) && media.readyState >= HTMLMediaElement.HAVE_METADATA) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onLoaded = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to load media metadata for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("loadedmetadata", onLoaded);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("loadedmetadata", onLoaded);
			media.addEventListener("error", onError, { once: true });
		});
	}

	private seekTo(media: HTMLMediaElement, targetSec: number): Promise<void> {
		if (Math.abs(media.currentTime - targetSec) < 0.0001) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onSeeked = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to seek media for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("seeked", onSeeked);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("seeked", onSeeked, { once: true });
			media.addEventListener("error", onError, { once: true });
			media.currentTime = targetSec;
		});
	}

	private findActiveTrimRegion(
		currentTimeMs: number,
		trimRegions: TrimRegion[],
	): TrimRegion | null {
		return (
			trimRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private findActiveSpeedRegion(
		currentTimeMs: number,
		speedRegions: SpeedRegion[],
	): SpeedRegion | null {
		return (
			speedRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private cloneWithTimestamp(src: AudioData, newTimestamp: number): AudioData {
		const isPlanar = src.format?.includes("planar") ?? false;
		const numPlanes = isPlanar ? src.numberOfChannels : 1;

		let totalSize = 0;
		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			totalSize += src.allocationSize({ planeIndex });
		}

		const buffer = new ArrayBuffer(totalSize);
		let offset = 0;

		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			const planeSize = src.allocationSize({ planeIndex });
			src.copyTo(new Uint8Array(buffer, offset, planeSize), { planeIndex });
			offset += planeSize;
		}

		return new AudioData({
			format: src.format!,
			sampleRate: src.sampleRate,
			numberOfFrames: src.numberOfFrames,
			numberOfChannels: src.numberOfChannels,
			timestamp: newTimestamp,
			data: buffer,
		});
	}

	private isInTrimRegion(timestampMs: number, trims: TrimRegion[]) {
		return trims.some((trim) => timestampMs >= trim.startMs && timestampMs < trim.endMs);
	}

	private computeTrimOffset(timestampMs: number, trims: TrimRegion[]) {
		let offset = 0;
		for (const trim of trims) {
			if (trim.endMs <= timestampMs) {
				offset += trim.endMs - trim.startMs;
			}
		}
		return offset;
	}

	cancel() {
		this.cancelled = true;
	}
}
