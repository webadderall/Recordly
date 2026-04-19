/**
 * useEditorExport – all export state and the handleExport workflow.
 *
 * The caller provides `getRenderConfig()` which is called at export-start
 * time; this avoids tracking 40+ reactive deps in this hook.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
	ExportBackendPreference,
	ExportEncodingMode,
	ExportFormat,
	ExportMp4FrameRate,
	ExportPipelineModel,
	ExportProgress,
	ExportQuality,
	ExportSettings,
	GifFrameRate,
	GifSizePreset,
	SupportedMp4Dimensions,
} from "@/lib/exporter";
import {
	calculateOutputDimensions,
	DEFAULT_MP4_CODEC,
	GIF_SIZE_PRESETS,
	GifExporter,
	ModernVideoExporter,
	VideoExporter,
} from "@/lib/exporter";
import { extensionHost } from "@/lib/extensions";
import { toFileUrl } from "../projectPersistence";
import type {
	AnnotationRegion,
	AudioRegion,
	AutoCaptionSettings,
	CaptionCue,
	CropRegion,
	CursorStyle,
	CursorTelemetryPoint,
	SpeedRegion,
	TrimRegion,
	WebcamOverlaySettings,
	ZoomRegion,
	ZoomTransitionEasing,
} from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";
import {
	calculateMp4ExportDimensions,
	getEncodingModeBitrateMultiplier,
	type SmokeExportConfig,
	summarizeErrorMessage,
	writeSmokeExportReport,
} from "../videoEditorUtils";

export type RenderConfig = {
	videoPath: string | null;
	wallpaper: string;
	shadowIntensity: number;
	backgroundBlur: number;
	zoomMotionBlur: number;
	connectZooms: boolean;
	zoomInDurationMs: number;
	zoomInOverlapMs: number;
	zoomOutDurationMs: number;
	connectedZoomGapMs: number;
	connectedZoomDurationMs: number;
	zoomInEasing: ZoomTransitionEasing;
	zoomOutEasing: ZoomTransitionEasing;
	connectedZoomEasing: ZoomTransitionEasing;
	showCursor: boolean;
	cursorStyle: CursorStyle;
	effectiveCursorTelemetry: CursorTelemetryPoint[];
	cursorSize: number;
	cursorSmoothing: number;
	zoomSmoothness: number;
	zoomClassicMode: boolean;
	cursorMotionBlur: number;
	cursorClickBounce: number;
	cursorClickBounceDuration: number;
	cursorSway: number;
	audioRegions: AudioRegion[];
	sourceAudioFallbackPaths: string[];
	exportEncodingMode: ExportEncodingMode;
	exportBackendPreference: ExportBackendPreference;
	exportPipelineModel: ExportPipelineModel;
	borderRadius: number;
	padding: number;
	cropRegion: CropRegion;
	webcam: WebcamOverlaySettings;
	resolvedWebcamVideoUrl: string | null;
	annotationRegions: AnnotationRegion[];
	autoCaptions: CaptionCue[];
	autoCaptionSettings: AutoCaptionSettings;
	isPlaying: boolean;
	exportQuality: ExportQuality;
	effectiveZoomRegions: ZoomRegion[];
	effectiveSpeedRegions: SpeedRegion[];
	trimRegions: TrimRegion[];
	mp4FrameRate: ExportMp4FrameRate;
	frame: string | null;
	exportFormat: ExportFormat;
	gifFrameRate: GifFrameRate;
	gifLoop: boolean;
	gifSizePreset: GifSizePreset;
};

interface UseEditorExportParams {
	videoPlaybackRef: React.RefObject<VideoPlaybackRef | null>;
	smokeExportConfig: SmokeExportConfig;
	getRenderConfig: () => RenderConfig;
	ensureSupportedMp4SourceDimensions: (
		frameRate: ExportMp4FrameRate,
	) => Promise<SupportedMp4Dimensions>;
	remountPreview: () => void;
}

type CancelableExporter = { cancel(): void };
type PendingExportSave = { fileName: string; arrayBuffer: ArrayBuffer };

export function useEditorExport({
	videoPlaybackRef,
	smokeExportConfig,
	getRenderConfig,
	ensureSupportedMp4SourceDimensions,
	remountPreview,
}: UseEditorExportParams) {
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [showExportDropdown, setShowExportDropdown] = useState(false);
	const [exportedFilePath, setExportedFilePath] = useState<string | undefined>(undefined);
	const [hasPendingExportSave, setHasPendingExportSave] = useState(false);
	const exporterRef = useRef<CancelableExporter | null>(null);
	const pendingExportSaveRef = useRef<PendingExportSave | null>(null);
	const smokeExportStartedRef = useRef(false);

	const clearPendingExportSave = useCallback(() => {
		pendingExportSaveRef.current = null;
		setHasPendingExportSave(false);
	}, []);

	const markExportAsSaving = useCallback(() => {
		setExportProgress((prev) => (prev ? { ...prev, phase: "saving" } : null));
	}, []);

	const showExportSuccessToast = useCallback((filePath: string) => {
		toast.success(`Exported successfully to ${filePath}`, {
			action: {
				label: "Show in Folder",
				onClick: async () => {
					try {
						const result = await window.electronAPI.revealInFolder(filePath);
						if (!result.success)
							toast.error(
								result.error ||
									result.message ||
									"Failed to reveal item in folder.",
							);
					} catch (err) {
						toast.error(`Error revealing in folder: ${String(err)}`);
					}
				},
			},
		});
	}, []);

	const handleExport = useCallback(
		async (settings: ExportSettings) => {
			const config = getRenderConfig();
			if (!config.videoPath) {
				toast.error("No video loaded");
				return;
			}
			const video = videoPlaybackRef.current?.video;
			if (!video) {
				toast.error("Video not ready");
				return;
			}

			setIsExporting(true);
			setExportProgress(null);
			setExportError(null);
			clearPendingExportSave();
			extensionHost.emitEvent({ type: "export:start" });
			const smokeExportStartedAt = smokeExportConfig.enabled ? performance.now() : null;
			let keepExportDialogOpen = false;

			try {
				const wasPlaying = config.isPlaying;
				const restoreTime = video.currentTime;
				if (wasPlaying) videoPlaybackRef.current?.pause();

				const containerElement = videoPlaybackRef.current?.containerRef?.current;
				const previewWidth = containerElement?.clientWidth || 1920;
				const previewHeight = containerElement?.clientHeight || 1080;
				const effectiveShadowIntensity =
					smokeExportConfig.enabled && smokeExportConfig.shadowIntensity !== undefined
						? smokeExportConfig.shadowIntensity
						: config.shadowIntensity;

				const smokeProgressSamples: Array<Record<string, unknown>> = [];
				let lastSmokeProgressSampleAt = 0;
				let lastSmokeProgressPhase: ExportProgress["phase"] | undefined;
				const recordSmokeProgress = (progress: ExportProgress) => {
					if (!smokeExportConfig.enabled || smokeExportStartedAt === null) return;
					const now = performance.now();
					const phase = progress.phase ?? "extracting";
					const shouldSample =
						smokeProgressSamples.length === 0 ||
						phase !== lastSmokeProgressPhase ||
						now - lastSmokeProgressSampleAt >= 1000 ||
						progress.currentFrame >= progress.totalFrames;
					if (!shouldSample) return;
					smokeProgressSamples.push({
						elapsedMs: Math.round(now - smokeExportStartedAt),
						phase,
						currentFrame: progress.currentFrame,
						totalFrames: progress.totalFrames,
						percentage: progress.percentage,
						estimatedTimeRemaining: progress.estimatedTimeRemaining,
						renderFps: progress.renderFps,
						renderBackend: progress.renderBackend,
						encodeBackend: progress.encodeBackend,
						encoderName: progress.encoderName,
					});
					lastSmokeProgressSampleAt = now;
					lastSmokeProgressPhase = phase;
				};

				if (settings.format === "gif" && settings.gifConfig) {
					const gifExporter = new GifExporter({
						videoUrl: config.videoPath,
						width: settings.gifConfig.width,
						height: settings.gifConfig.height,
						frameRate: settings.gifConfig.frameRate,
						loop: settings.gifConfig.loop,
						sizePreset: settings.gifConfig.sizePreset,
						wallpaper: config.wallpaper,
						trimRegions: config.trimRegions,
						speedRegions: config.effectiveSpeedRegions,
						showShadow: effectiveShadowIntensity > 0,
						shadowIntensity: effectiveShadowIntensity,
						backgroundBlur: config.backgroundBlur,
						zoomMotionBlur: config.zoomMotionBlur,
						connectZooms: config.connectZooms,
						zoomInDurationMs: config.zoomInDurationMs,
						zoomInOverlapMs: config.zoomInOverlapMs,
						zoomOutDurationMs: config.zoomOutDurationMs,
						connectedZoomGapMs: config.connectedZoomGapMs,
						connectedZoomDurationMs: config.connectedZoomDurationMs,
						zoomInEasing: config.zoomInEasing,
						zoomOutEasing: config.zoomOutEasing,
						connectedZoomEasing: config.connectedZoomEasing,
						borderRadius: config.borderRadius,
						padding: config.padding,
						videoPadding: config.padding,
						cropRegion: config.cropRegion,
						webcam: config.webcam,
						webcamUrl:
							config.resolvedWebcamVideoUrl ??
							(config.webcam.sourcePath ? toFileUrl(config.webcam.sourcePath) : null),
						annotationRegions: config.annotationRegions,
						autoCaptions: config.autoCaptions,
						autoCaptionSettings: config.autoCaptionSettings,
						zoomRegions: config.effectiveZoomRegions,
						cursorTelemetry: config.effectiveCursorTelemetry,
						showCursor: config.showCursor,
						cursorStyle: config.cursorStyle,
						cursorSize: config.cursorSize,
						cursorSmoothing: config.cursorSmoothing,
						zoomSmoothness: config.zoomSmoothness,
						zoomClassicMode: config.zoomClassicMode,
						cursorMotionBlur: config.cursorMotionBlur,
						cursorClickBounce: config.cursorClickBounce,
						cursorClickBounceDuration: config.cursorClickBounceDuration,
						cursorSway: config.cursorSway,
						frame: config.frame,
						previewWidth,
						previewHeight,
						maxDecodeQueue: smokeExportConfig.maxDecodeQueue,
						maxPendingFrames: smokeExportConfig.maxPendingFrames,
						onProgress: (progress: ExportProgress) => {
							recordSmokeProgress(progress);
							setExportProgress(progress);
						},
					});
					exporterRef.current = gifExporter as unknown as CancelableExporter;
					const result = await gifExporter.export();
					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();
						const fileName = `export-${Date.now()}.gif`;
						markExportAsSaving();
						const saveResult =
							smokeExportConfig.enabled && smokeExportConfig.outputPath
								? await window.electronAPI.writeExportedVideoToPath(
										arrayBuffer,
										smokeExportConfig.outputPath,
									)
								: await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);
						if (saveResult.canceled) {
							pendingExportSaveRef.current = { arrayBuffer, fileName };
							setHasPendingExportSave(true);
							setExportError(
								"Save dialog canceled. Click Save Again to save without re-rendering.",
							);
							toast.info("Save canceled. You can save again without re-exporting.");
							keepExportDialogOpen = true;
						} else if (saveResult.success && saveResult.path) {
							if (smokeExportStartedAt !== null)
								console.log(
									`[smoke-export] Completed in ${Math.round(performance.now() - smokeExportStartedAt)}ms`,
								);
							showExportSuccessToast(saveResult.path);
							setExportedFilePath(saveResult.path);
							if (smokeExportConfig.enabled) {
								window.close();
								return;
							}
						} else {
							setExportError(saveResult.message || "Failed to save GIF");
							toast.error(saveResult.message || "Failed to save GIF");
							if (smokeExportConfig.enabled) {
								window.close();
								return;
							}
						}
					} else {
						setExportError(result.error || "GIF export failed");
						toast.error(result.error || "GIF export failed");
						if (smokeExportConfig.enabled) {
							window.close();
							return;
						}
					}
				} else {
					const quality = settings.quality ?? config.exportQuality;
					const encodingMode = smokeExportConfig.enabled
						? (smokeExportConfig.encodingMode ??
							settings.encodingMode ??
							config.exportEncodingMode)
						: (settings.encodingMode ?? config.exportEncodingMode);
					const selectedMp4FrameRate = settings.mp4FrameRate ?? config.mp4FrameRate;
					const pipelineModel = smokeExportConfig.enabled
						? (smokeExportConfig.pipelineModel ??
							(smokeExportConfig.useNativeExport ? "modern" : "legacy"))
						: (settings.pipelineModel ?? config.exportPipelineModel);
					const backendPreference =
						pipelineModel === "legacy"
							? "webcodecs"
							: smokeExportConfig.enabled
								? (smokeExportConfig.backendPreference ??
									(smokeExportConfig.useNativeExport ? "breeze" : "webcodecs"))
								: (settings.backendPreference ?? config.exportBackendPreference);

					const supportedSourceDimensions =
						await ensureSupportedMp4SourceDimensions(selectedMp4FrameRate);
					const { width: exportWidth, height: exportHeight } =
						calculateMp4ExportDimensions(
							supportedSourceDimensions.width,
							supportedSourceDimensions.height,
							quality,
						);

					let bitrate: number;
					if (quality === "source") {
						const totalPixels = exportWidth * exportHeight;
						bitrate =
							totalPixels > 2560 * 1440
								? 80_000_000
								: totalPixels > 1920 * 1080
									? 50_000_000
									: 30_000_000;
					} else {
						const totalPixels = exportWidth * exportHeight;
						bitrate =
							totalPixels <= 1280 * 720
								? 10_000_000
								: totalPixels <= 1920 * 1080
									? 20_000_000
									: 30_000_000;
					}
					bitrate = Math.max(
						2_000_000,
						Math.round(bitrate * getEncodingModeBitrateMultiplier(encodingMode)),
					);

					const exporterConfig = {
						videoUrl: config.videoPath,
						width: exportWidth,
						height: exportHeight,
						frameRate: selectedMp4FrameRate,
						bitrate,
						codec: DEFAULT_MP4_CODEC,
						encodingMode,
						preferredEncoderPath: supportedSourceDimensions.encoderPath,
						experimentalNativeExport: smokeExportConfig.useNativeExport,
						maxEncodeQueue: smokeExportConfig.maxEncodeQueue,
						maxDecodeQueue: smokeExportConfig.maxDecodeQueue,
						maxPendingFrames: smokeExportConfig.maxPendingFrames,
						wallpaper: config.wallpaper,
						trimRegions: config.trimRegions,
						speedRegions: config.effectiveSpeedRegions,
						showShadow: effectiveShadowIntensity > 0,
						shadowIntensity: effectiveShadowIntensity,
						backgroundBlur: config.backgroundBlur,
						zoomMotionBlur: config.zoomMotionBlur,
						connectZooms: config.connectZooms,
						zoomInDurationMs: config.zoomInDurationMs,
						zoomInOverlapMs: config.zoomInOverlapMs,
						zoomOutDurationMs: config.zoomOutDurationMs,
						connectedZoomGapMs: config.connectedZoomGapMs,
						connectedZoomDurationMs: config.connectedZoomDurationMs,
						zoomInEasing: config.zoomInEasing,
						zoomOutEasing: config.zoomOutEasing,
						connectedZoomEasing: config.connectedZoomEasing,
						borderRadius: config.borderRadius,
						padding: config.padding,
						cropRegion: config.cropRegion,
						webcam: config.webcam,
						webcamUrl:
							config.resolvedWebcamVideoUrl ??
							(config.webcam.sourcePath ? toFileUrl(config.webcam.sourcePath) : null),
						annotationRegions: config.annotationRegions,
						autoCaptions: config.autoCaptions,
						autoCaptionSettings: config.autoCaptionSettings,
						zoomRegions: config.effectiveZoomRegions,
						cursorTelemetry: config.effectiveCursorTelemetry,
						showCursor: config.showCursor,
						cursorStyle: config.cursorStyle,
						cursorSize: config.cursorSize,
						cursorSmoothing: config.cursorSmoothing,
						zoomSmoothness: config.zoomSmoothness,
						zoomClassicMode: config.zoomClassicMode,
						cursorMotionBlur: config.cursorMotionBlur,
						cursorClickBounce: config.cursorClickBounce,
						cursorClickBounceDuration: config.cursorClickBounceDuration,
						cursorSway: config.cursorSway,
						frame: config.frame,
						audioRegions: config.audioRegions,
						sourceAudioFallbackPaths: config.sourceAudioFallbackPaths,
						previewWidth,
						previewHeight,
						onProgress: (progress: ExportProgress) => {
							recordSmokeProgress(progress);
							setExportProgress(progress);
						},
					};

					const exporter =
						pipelineModel === "modern"
							? new ModernVideoExporter({ ...exporterConfig, backendPreference })
							: new VideoExporter(exporterConfig);
					exporterRef.current = exporter;
					const result = await exporter.export();
					const smokeElapsedMs =
						smokeExportStartedAt !== null
							? Math.round(performance.now() - smokeExportStartedAt)
							: undefined;

					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();
						const fileName = `export-${Date.now()}.mp4`;
						markExportAsSaving();
						const saveResult =
							smokeExportConfig.enabled && smokeExportConfig.outputPath
								? await window.electronAPI.writeExportedVideoToPath(
										arrayBuffer,
										smokeExportConfig.outputPath,
									)
								: await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);
						if (saveResult.canceled) {
							if (smokeExportConfig.enabled)
								await writeSmokeExportReport(smokeExportConfig.outputPath, {
									success: false,
									phase: "save",
									format: "mp4",
									pipelineModel,
									backendPreference,
									encodingMode,
									shadowIntensity: effectiveShadowIntensity,
									elapsedMs: smokeElapsedMs,
									error: "Save canceled",
									progressSamples: smokeProgressSamples,
									metrics: result.metrics,
								});
							pendingExportSaveRef.current = { arrayBuffer, fileName };
							setHasPendingExportSave(true);
							setExportError(
								"Save dialog canceled. Click Save Again to save without re-rendering.",
							);
							toast.info("Save canceled. You can save again without re-exporting.");
							keepExportDialogOpen = true;
						} else if (saveResult.success && saveResult.path) {
							if (smokeExportConfig.enabled)
								await writeSmokeExportReport(smokeExportConfig.outputPath, {
									success: true,
									phase: "saved",
									format: "mp4",
									pipelineModel,
									backendPreference,
									encodingMode,
									shadowIntensity: effectiveShadowIntensity,
									elapsedMs: smokeElapsedMs,
									outputPath: saveResult.path,
									progressSamples: smokeProgressSamples,
									metrics: result.metrics,
								});
							if (smokeExportStartedAt !== null)
								console.log(
									`[smoke-export] Completed in ${Math.round(performance.now() - smokeExportStartedAt)}ms`,
								);
							showExportSuccessToast(saveResult.path);
							setExportedFilePath(saveResult.path);
							if (smokeExportConfig.enabled) {
								window.close();
								return;
							}
						} else {
							if (smokeExportConfig.enabled)
								await writeSmokeExportReport(smokeExportConfig.outputPath, {
									success: false,
									phase: "save",
									format: "mp4",
									pipelineModel,
									backendPreference,
									encodingMode,
									shadowIntensity: effectiveShadowIntensity,
									elapsedMs: smokeElapsedMs,
									error: saveResult.message || "Failed to save video",
									progressSamples: smokeProgressSamples,
									metrics: result.metrics,
								});
							setExportError(saveResult.message || "Failed to save video");
							toast.error(saveResult.message || "Failed to save video");
							if (smokeExportConfig.enabled) {
								window.close();
								return;
							}
						}
					} else {
						if (smokeExportConfig.enabled)
							await writeSmokeExportReport(smokeExportConfig.outputPath, {
								success: false,
								phase: "export",
								format: "mp4",
								pipelineModel,
								backendPreference,
								encodingMode,
								shadowIntensity: effectiveShadowIntensity,
								elapsedMs: smokeElapsedMs,
								error: result.error || "Export failed",
								progressSamples: smokeProgressSamples,
								metrics: result.metrics,
							});
						setExportError(result.error || "Export failed");
						toast.error(summarizeErrorMessage(result.error || "Export failed"));
						if (smokeExportConfig.enabled) {
							window.close();
							return;
						}
					}
				}

				if (wasPlaying) {
					videoPlaybackRef.current?.play();
				} else {
					video.currentTime = restoreTime;
				}
			} catch (error) {
				console.error("Export error:", error);
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				if (smokeExportConfig.enabled) {
					await writeSmokeExportReport(smokeExportConfig.outputPath, {
						success: false,
						phase: "exception",
						format: settings.format,
						elapsedMs:
							smokeExportConfig.enabled && performance
								? Math.round(
										performance.now() -
											(smokeExportStartedAt ?? performance.now()),
									)
								: undefined,
						error: errorMessage,
					});
					window.close();
				}
				setExportError(errorMessage);
				toast.error(`Export failed: ${summarizeErrorMessage(errorMessage)}`);
			} finally {
				extensionHost.emitEvent({ type: "export:complete" });
				setIsExporting(false);
				exporterRef.current = null;
				setShowExportDropdown(keepExportDialogOpen);
				remountPreview();
			}
		},
		[
			getRenderConfig,
			videoPlaybackRef,
			smokeExportConfig,
			ensureSupportedMp4SourceDimensions,
			remountPreview,
			clearPendingExportSave,
			markExportAsSaving,
			showExportSuccessToast,
		],
	);

	const handleOpenExportDropdown = useCallback(() => {
		const { videoPath } = getRenderConfig();
		if (!videoPath) {
			toast.error("No video loaded");
			return;
		}
		if (hasPendingExportSave) {
			setShowExportDropdown(true);
			setExportError("Save dialog canceled. Click Save Again to save without re-rendering.");
			return;
		}
		setShowExportDropdown(true);
		setExportProgress(null);
		setExportError(null);
	}, [getRenderConfig, hasPendingExportSave]);

	const handleStartExportFromDropdown = useCallback(() => {
		const config = getRenderConfig();
		if (!config.videoPath) {
			toast.error("No video loaded");
			return;
		}
		const video = videoPlaybackRef.current?.video;
		if (!video) {
			toast.error("Video not ready");
			return;
		}
		const sourceWidth = video.videoWidth || 1920;
		const sourceHeight = video.videoHeight || 1080;
		const gifDimensions = calculateOutputDimensions(
			sourceWidth,
			sourceHeight,
			config.gifSizePreset,
			GIF_SIZE_PRESETS,
		);
		const settings: ExportSettings = {
			format: config.exportFormat,
			encodingMode: config.exportFormat === "mp4" ? config.exportEncodingMode : undefined,
			mp4FrameRate: config.exportFormat === "mp4" ? config.mp4FrameRate : undefined,
			backendPreference:
				config.exportFormat === "mp4" ? config.exportBackendPreference : undefined,
			pipelineModel: config.exportFormat === "mp4" ? config.exportPipelineModel : undefined,
			quality: config.exportFormat === "mp4" ? config.exportQuality : undefined,
			gifConfig:
				config.exportFormat === "gif"
					? {
							frameRate: config.gifFrameRate,
							loop: config.gifLoop,
							sizePreset: config.gifSizePreset,
							width: gifDimensions.width,
							height: gifDimensions.height,
						}
					: undefined,
		};
		setExportError(null);
		setExportedFilePath(undefined);
		setShowExportDropdown(true);
		handleExport(settings);
	}, [getRenderConfig, videoPlaybackRef, handleExport]);

	const handleCancelExport = useCallback(() => {
		if (exporterRef.current) {
			exporterRef.current.cancel();
			toast.info("Export canceled");
			clearPendingExportSave();
			setShowExportDropdown(false);
			setIsExporting(false);
			setExportProgress(null);
			setExportError(null);
			setExportedFilePath(undefined);
		}
	}, [clearPendingExportSave]);

	const handleExportDropdownClose = useCallback(() => {
		clearPendingExportSave();
		setShowExportDropdown(false);
		setExportProgress(null);
		setExportError(null);
		setExportedFilePath(undefined);
	}, [clearPendingExportSave]);

	const handleRetrySaveExport = useCallback(async () => {
		const pendingSave = pendingExportSaveRef.current;
		if (!pendingSave) return;
		const saveResult = await window.electronAPI.saveExportedVideo(
			pendingSave.arrayBuffer,
			pendingSave.fileName,
		);
		if (saveResult.canceled) {
			setExportError("Save dialog canceled. Click Save Again to save without re-rendering.");
			toast.info("Save canceled. You can try again.");
			return;
		}
		if (saveResult.success && saveResult.path) {
			clearPendingExportSave();
			setExportError(null);
			setExportedFilePath(saveResult.path);
			showExportSuccessToast(saveResult.path);
			setShowExportDropdown(true);
			return;
		}
		const errorMessage = saveResult.message || "Failed to save video";
		setExportError(errorMessage);
		toast.error(errorMessage);
	}, [clearPendingExportSave, showExportSuccessToast]);

	// Export status derived values
	const isExportSaving = exportProgress?.phase === "saving";
	const isExportFinalizing = exportProgress?.phase === "finalizing";
	const isRenderingAudio =
		isExportFinalizing && typeof exportProgress?.audioProgress === "number";
	const exportFinalizingProgress = isExportFinalizing
		? Math.min(
				typeof exportProgress?.renderProgress === "number"
					? exportProgress.renderProgress
					: (exportProgress?.percentage ?? 100),
				100,
			)
		: null;

	// Smoke export trigger
	const smokeExportTriggerable = useMemo(
		() => ({
			enabled: smokeExportConfig.enabled,
			encodingMode: smokeExportConfig.encodingMode,
		}),
		[smokeExportConfig.enabled, smokeExportConfig.encodingMode],
	);

	return {
		isExporting,
		exportProgress,
		exportError,
		exportedFilePath,
		showExportDropdown,
		setShowExportDropdown,
		hasPendingExportSave,
		handleExport,
		handleOpenExportDropdown,
		handleStartExportFromDropdown,
		handleCancelExport,
		handleExportDropdownClose,
		handleRetrySaveExport,
		showExportSuccessToast,
		clearPendingExportSave,
		markExportAsSaving,
		isExportSaving,
		isExportFinalizing,
		isRenderingAudio,
		exportFinalizingProgress,
		smokeExportStartedRef,
		smokeExportTriggerable,
	};
}
