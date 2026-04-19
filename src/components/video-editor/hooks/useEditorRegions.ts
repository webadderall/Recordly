/**
 * useEditorRegions – owns all timeline region state (zoom, clip,
 * annotation, audio) together with every handler that mutates them.
 *
 * Trim regions are derived automatically from clips (gaps between clips).
 * Speed regions are derived automatically from clip speeds.
 * Neither trims nor speeds are user-editable as standalone entities.
 */

import type { Span } from "dnd-timeline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extensionHost } from "@/lib/extensions";
import { deriveNextId } from "../projectPersistence";
import {
	type AnnotationRegion,
	type AudioRegion,
	type ClipRegion,
	clampFocusToDepth,
	clipsToTrims,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_AUTO_ZOOM_DEPTH,
	DEFAULT_FIGURE_DATA,
	DEFAULT_ZOOM_DEPTH,
	type EditorEffectSection,
	type FigureData,
	getClipSourceEndMs,
	getClipSourceStartMs,
	type SpeedRegion,
	type TrimRegion,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomMode,
	type ZoomRegion,
} from "../types";

interface UseEditorRegionsParams {
	duration: number;
	currentTime: number;
	videoPath: string | null;
	setActiveEffectSection: (
		section: EditorEffectSection | ((prev: EditorEffectSection) => EditorEffectSection),
	) => void;
}

export function useEditorRegions({
	duration,
	currentTime,
	videoPath,
	setActiveEffectSection,
}: UseEditorRegionsParams) {
	// ─── Region state ───────────────────────────────────────────────────────
	const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
	const [clipRegions, setClipRegions] = useState<ClipRegion[]>([]);
	const [annotationRegions, setAnnotationRegions] = useState<AnnotationRegion[]>([]);
	const [audioRegions, setAudioRegions] = useState<AudioRegion[]>([]);

	// ─── Selection state ────────────────────────────────────────────────────
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
	const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
	const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

	// ─── ID counters ────────────────────────────────────────────────────────
	const nextZoomIdRef = useRef(1);
	const nextClipIdRef = useRef(1);
	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1);
	const nextAudioIdRef = useRef(1);
	const clipInitializedRef = useRef(false);
	const autoSuggestedVideoPathRef = useRef<string | null>(null);
	const pendingFreshRecordingAutoZoomPathRef = useRef<string | null>(null);

	// ─── Derived ────────────────────────────────────────────────────────────
	const totalMs = useMemo(() => Math.round(duration * 1000), [duration]);

	// Initialise a single full-track clip when duration first becomes known
	useEffect(() => {
		if (totalMs <= 0 || clipInitializedRef.current) return;
		if (clipRegions.length === 0) {
			const id = `clip-${nextClipIdRef.current++}`;
			setClipRegions([{ id, startMs: 0, endMs: totalMs, speed: 1 }]);
		}
		clipInitializedRef.current = true;
	}, [totalMs, clipRegions.length]);

	// Trim regions are derived from clips (gaps = sections to remove in export)
	const trimRegions = useMemo<TrimRegion[]>(() => {
		if (totalMs <= 0) return [];
		if (clipRegions.length === 0) {
			return [{ id: "trim-all", startMs: 0, endMs: totalMs }];
		}
		return clipsToTrims(clipRegions, totalMs);
	}, [clipRegions, totalMs]);

	// Clear stale selection IDs when regions are removed externally
	useEffect(() => {
		if (selectedZoomId && !zoomRegions.some((r) => r.id === selectedZoomId))
			setSelectedZoomId(null);
	}, [selectedZoomId, zoomRegions]);
	useEffect(() => {
		if (selectedAnnotationId && !annotationRegions.some((r) => r.id === selectedAnnotationId))
			setSelectedAnnotationId(null);
	}, [selectedAnnotationId, annotationRegions]);
	useEffect(() => {
		if (selectedAudioId && !audioRegions.some((r) => r.id === selectedAudioId))
			setSelectedAudioId(null);
	}, [selectedAudioId, audioRegions]);

	// ─── Time mapping ───────────────────────────────────────────────────────
	const mapTimelineTimeToSourceTime = useCallback(
		(timeMs: number) => {
			for (const clip of clipRegions) {
				if (timeMs < clip.startMs || timeMs > clip.endMs) continue;
				const sourceStart = getClipSourceStartMs(clip);
				const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
				return Math.round(sourceStart + (timeMs - clip.startMs) * speed);
			}
			return Math.round(timeMs);
		},
		[clipRegions],
	);

	const mapSourceTimeToTimelineTime = useCallback(
		(timeMs: number) => {
			for (const clip of clipRegions) {
				const sourceStart = getClipSourceStartMs(clip);
				const sourceEndMs = getClipSourceEndMs(clip);
				if (timeMs < sourceStart || timeMs > sourceEndMs) continue;
				const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
				return Math.round(clip.startMs + (timeMs - sourceStart) / speed);
			}
			return Math.round(timeMs);
		},
		[clipRegions],
	);

	// ─── Effective regions ──────────────────────────────────────────────────
	const effectiveZoomRegions = useMemo<ZoomRegion[]>(
		() =>
			zoomRegions.map((r) => ({
				...r,
				startMs: mapTimelineTimeToSourceTime(r.startMs),
				endMs: mapTimelineTimeToSourceTime(r.endMs),
			})),
		[zoomRegions, mapTimelineTimeToSourceTime],
	);

	// Speed regions derived purely from clip speeds (no standalone speed regions)
	const effectiveSpeedRegions = useMemo<SpeedRegion[]>(
		() =>
			clipRegions
				.filter((c) => c.speed !== 1)
				.map((c) => ({
					id: `clip-speed-${c.id}`,
					startMs: getClipSourceStartMs(c),
					endMs: getClipSourceEndMs(c),
					speed: c.speed,
				})),
		[clipRegions],
	);

	const timelinePlayheadTime = useMemo(
		() => mapSourceTimeToTimelineTime(currentTime * 1000) / 1000,
		[currentTime, mapSourceTimeToTimelineTime],
	);

	// ─── Zoom handlers ──────────────────────────────────────────────────────
	const handleZoomAdded = useCallback(
		(span: Span) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_ZOOM_DEPTH,
				focus: { cx: 0.5, cy: 0.5 },
				mode: "manual",
			};
			if (videoPath && pendingFreshRecordingAutoZoomPathRef.current === videoPath) {
				autoSuggestedVideoPathRef.current = videoPath;
				pendingFreshRecordingAutoZoomPathRef.current = null;
			}
			setZoomRegions((prev) => [...prev, newRegion]);
			setSelectedZoomId(id);

			setSelectedAnnotationId(null);
			extensionHost.emitEvent({
				type: "timeline:region-added",
				data: { id, startMs: newRegion.startMs, endMs: newRegion.endMs },
			});
		},
		[videoPath],
	);

	const handleZoomSuggested = useCallback(
		(span: Span, focus: ZoomFocus) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_AUTO_ZOOM_DEPTH,
				focus: clampFocusToDepth(focus, DEFAULT_AUTO_ZOOM_DEPTH),
				mode: "auto",
			};
			if (videoPath && pendingFreshRecordingAutoZoomPathRef.current === videoPath) {
				autoSuggestedVideoPathRef.current = videoPath;
				pendingFreshRecordingAutoZoomPathRef.current = null;
			}
			setZoomRegions((prev) => [...prev, newRegion]);
			extensionHost.emitEvent({
				type: "timeline:region-added",
				data: { id, startMs: newRegion.startMs, endMs: newRegion.endMs },
			});
		},
		[videoPath],
	);

	const handleZoomSpanChange = useCallback((id: string, span: Span) => {
		setZoomRegions((prev) =>
			prev.map((r) =>
				r.id === id
					? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) }
					: r,
			),
		);
	}, []);

	const handleZoomDelete = useCallback((id: string) => {
		setZoomRegions((prev) => prev.filter((r) => r.id !== id));
		setSelectedZoomId((cur) => (cur === id ? null : cur));
		extensionHost.emitEvent({ type: "timeline:region-removed", data: { id } });
	}, []);

	const handleZoomFocusChange = useCallback((id: string, focus: ZoomFocus) => {
		setZoomRegions((prev) =>
			prev.map((r) => (r.id === id ? { ...r, focus: clampFocusToDepth(focus, r.depth) } : r)),
		);
	}, []);

	const handleZoomDepthChange = useCallback(
		(depth: ZoomDepth) => {
			setZoomRegions((prev) =>
				prev.map((r) =>
					r.id === selectedZoomId
						? { ...r, depth, focus: clampFocusToDepth(r.focus, depth) }
						: r,
				),
			);
		},
		[selectedZoomId],
	);

	const handleZoomModeChange = useCallback(
		(mode: ZoomMode) => {
			setZoomRegions((prev) =>
				prev.map((r) => (r.id === selectedZoomId ? { ...r, mode } : r)),
			);
		},
		[selectedZoomId],
	);

	const handleSelectZoom = useCallback(
		(id: string | null) => {
			setSelectedZoomId(id);
			if (id) {
				setActiveEffectSection("zoom");
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
			} else {
				setActiveEffectSection((s) => (s === "zoom" ? "scene" : s));
			}
		},
		[setActiveEffectSection],
	);

	// ─── Clip handlers ──────────────────────────────────────────────────────
	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectedClipId(id);
			if (id) {
				setActiveEffectSection("clip");
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
			} else {
				setActiveEffectSection((s) => (s === "clip" ? "scene" : s));
			}
		},
		[setActiveEffectSection],
	);

	const handleClipSplit = useCallback(
		(splitMs: number) => {
			setClipRegions((prev) => {
				const target = prev.find((c) => splitMs > c.startMs && splitMs < c.endMs);
				if (!target) return prev;
				const leftId = `clip-${nextClipIdRef.current++}`;
				const rightId = `clip-${nextClipIdRef.current++}`;
				const speed = Number.isFinite(target.speed) && target.speed > 0 ? target.speed : 1;
				const targetSourceStart = target.sourceStartMs ?? target.startMs;
				const splitOffset = Math.round(splitMs) - target.startMs;
				const rightSourceStart = Math.round(targetSourceStart + splitOffset * speed);
				const left: ClipRegion = {
					id: leftId,
					startMs: target.startMs,
					endMs: Math.round(splitMs),
					speed: target.speed,
					muted: target.muted,
					sourceStartMs: target.sourceStartMs,
				};
				const right: ClipRegion = {
					id: rightId,
					startMs: Math.round(splitMs),
					endMs: target.endMs,
					speed: target.speed,
					muted: target.muted,
					sourceStartMs: rightSourceStart,
				};
				if (selectedClipId === target.id) setSelectedClipId(leftId);
				return prev.flatMap((c) => (c.id === target.id ? [left, right] : [c]));
			});
		},
		[selectedClipId],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: Span) => {
			const oldClip = clipRegions.find((c) => c.id === id);
			const newStart = Math.round(span.start);
			const newEnd = Math.round(span.end);
			if (oldClip) {
				const startDelta = newStart - oldClip.startMs;
				const endDelta = newEnd - oldClip.endMs;
				const isMove = Math.abs(startDelta - endDelta) < 1 && Math.abs(startDelta) > 0;
				if (isMove) {
					const delta = startDelta;
					const moveOverlapping = <T extends { startMs: number; endMs: number }>(
						regions: T[],
					): T[] =>
						regions.map((r) =>
							r.startMs >= oldClip.startMs && r.endMs <= oldClip.endMs
								? { ...r, startMs: r.startMs + delta, endMs: r.endMs + delta }
								: r,
						);
					setZoomRegions((prev) => moveOverlapping(prev));
					setAnnotationRegions((prev) => moveOverlapping(prev));
					setAudioRegions((prev) => moveOverlapping(prev));
				}
			}
			setClipRegions((prev) =>
				prev.map((c) => {
					if (c.id !== id) return c;
					const updated: ClipRegion = { ...c, startMs: newStart, endMs: newEnd };
					if (oldClip) {
						const startDelta = newStart - oldClip.startMs;
						const endDelta = newEnd - oldClip.endMs;
						const isMove =
							Math.abs(startDelta - endDelta) < 1 && Math.abs(startDelta) > 0;
					const sourceStart = getClipSourceStartMs(oldClip);
					const speed =
						Number.isFinite(oldClip.speed) && oldClip.speed > 0
							? oldClip.speed
							: 1;
					if (isMove) {
						// Move: freeze the resolved source start
						updated.sourceStartMs = sourceStart;
					} else if (Math.abs(startDelta) > 0) {
						// Left-edge resize: shift sourceStartMs by startDelta * speed
						updated.sourceStartMs = Math.max(
							0,
							Math.round(sourceStart + startDelta * speed),
						);
					}
					}
					return updated;
				}),
			);

			// Remove regions that no longer overlap any clip after the change
			const updatedClips = clipRegions.map((c) =>
				c.id === id ? { ...c, startMs: newStart, endMs: newEnd } : c,
			);
			const keepOverlapping = <T extends { startMs: number; endMs: number }>(
				regions: T[],
			): T[] =>
				regions.filter((r) =>
					updatedClips.some((c) => r.startMs < c.endMs && r.endMs > c.startMs),
				);
			setZoomRegions((prev) => keepOverlapping(prev));
			setAnnotationRegions((prev) => keepOverlapping(prev));
			setAudioRegions((prev) => keepOverlapping(prev));
		},
		[clipRegions],
	);

	const handleClipSpeedChange = useCallback(
		(speed: number) => {
			if (!selectedClipId || !Number.isFinite(speed) || speed <= 0) return;
			const clip = clipRegions.find((c) => c.id === selectedClipId);
			if (!clip) return;
			const oldSpeed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
			const sourceDurationMs = (clip.endMs - clip.startMs) * oldSpeed;
			let newEndMs = Math.round(clip.startMs + sourceDurationMs / speed);
			// Clamp to not overlap the next clip or exceed video duration
			const nextClipStart = clipRegions
				.filter((c) => c.id !== selectedClipId && c.startMs > clip.startMs)
				.reduce((min, c) => Math.min(min, c.startMs), totalMs);
			newEndMs = Math.min(newEndMs, nextClipStart);
			const clampedSpeed =
				newEndMs > clip.startMs ? sourceDurationMs / (newEndMs - clip.startMs) : speed;
			const scaleFactor = oldSpeed / clampedSpeed;
			setClipRegions((prev) =>
				prev.map((c) =>
					c.id === selectedClipId ? { ...c, speed: clampedSpeed, endMs: newEndMs } : c,
				),
			);
			// Scale all child regions within this clip proportionally
			const scaleInClip = <T extends { startMs: number; endMs: number }>(regions: T[]): T[] =>
				regions.map((r) => {
					if (r.startMs < clip.startMs || r.endMs > clip.endMs) return r;
					return {
						...r,
						startMs: Math.round(
							clip.startMs + (r.startMs - clip.startMs) * scaleFactor,
						),
						endMs: Math.round(clip.startMs + (r.endMs - clip.startMs) * scaleFactor),
					};
				});
			setZoomRegions((prev) => scaleInClip(prev));
			setAnnotationRegions((prev) => scaleInClip(prev));
			setAudioRegions((prev) => scaleInClip(prev));
		},
		[selectedClipId, clipRegions, totalMs],
	);

	const handleClipMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((prev) =>
				prev.map((c) => (c.id === selectedClipId ? { ...c, muted } : c)),
			);
		},
		[selectedClipId],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			const deletedClip = clipRegions.find((c) => c.id === id);
			setClipRegions((prev) => prev.filter((c) => c.id !== id));
			if (deletedClip) {
				const { startMs, endMs } = deletedClip;
				// Cascade: remove all timeline items fully within the deleted clip's span
				setZoomRegions((prev) =>
					prev.filter((r) => r.startMs < startMs || r.endMs > endMs),
				);
				setAnnotationRegions((prev) =>
					prev.filter((r) => r.startMs < startMs || r.endMs > endMs),
				);
				setAudioRegions((prev) =>
					prev.filter((r) => r.startMs < startMs || r.endMs > endMs),
				);
			}
			setSelectedClipId((cur) => (cur === id ? null : cur));
		},
		[clipRegions],
	);

	// ─── Annotation handlers ─────────────────────────────────────────────────
	const handleSelectAnnotation = useCallback((id: string | null) => {
		setSelectedAnnotationId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedAudioId(null);
		}
	}, []);

	const handleAnnotationAdded = useCallback((span: Span, trackIndex = 0) => {
		const id = `annotation-${nextAnnotationIdRef.current++}`;
		const zIndex = nextAnnotationZIndexRef.current++;
		const newRegion: AnnotationRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
			type: "text",
			content: "Enter text...",
			position: { ...DEFAULT_ANNOTATION_POSITION },
			size: { ...DEFAULT_ANNOTATION_SIZE },
			style: { ...DEFAULT_ANNOTATION_STYLE },
			zIndex,
			trackIndex,
		};
		setAnnotationRegions((prev) => [...prev, newRegion]);
		setSelectedAnnotationId(id);
		setSelectedZoomId(null);
	}, []);

	const handleAnnotationSpanChange = useCallback((id: string, span: Span) => {
		setAnnotationRegions((prev) =>
			prev.map((r) =>
				r.id === id
					? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) }
					: r,
			),
		);
	}, []);

	const handleAnnotationDelete = useCallback((id: string) => {
		setAnnotationRegions((prev) => prev.filter((r) => r.id !== id));
		setSelectedAnnotationId((cur) => (cur === id ? null : cur));
	}, []);

	const handleAnnotationContentChange = useCallback((id: string, content: string) => {
		setAnnotationRegions((prev) =>
			prev.map((r) => {
				if (r.id !== id) return r;
				if (r.type === "text") return { ...r, content, textContent: content };
				if (r.type === "image") return { ...r, content, imageContent: content };
				return { ...r, content };
			}),
		);
	}, []);

	const handleAnnotationTypeChange = useCallback((id: string, type: AnnotationRegion["type"]) => {
		setAnnotationRegions((prev) =>
			prev.map((r) => {
				if (r.id !== id) return r;
				const updated = { ...r, type };
				if (type === "text") updated.content = r.textContent || "Enter text...";
				else if (type === "image") updated.content = r.imageContent || "";
				else if (type === "figure") {
					updated.content = "";
					if (!r.figureData)
						(updated as AnnotationRegion).figureData = { ...DEFAULT_FIGURE_DATA };
				} else if (type === "blur") {
					updated.content = "";
					if (r.blurIntensity === undefined)
						(updated as AnnotationRegion).blurIntensity = 20;
				}
				return updated;
			}),
		);
	}, []);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			setAnnotationRegions((prev) =>
				prev.map((r) => (r.id === id ? { ...r, style: { ...r.style, ...style } } : r)),
			);
		},
		[],
	);

	const handleAnnotationFigureDataChange = useCallback((id: string, figureData: FigureData) => {
		setAnnotationRegions((prev) => prev.map((r) => (r.id === id ? { ...r, figureData } : r)));
	}, []);

	const handleAnnotationBlurIntensityChange = useCallback((id: string, blurIntensity: number) => {
		setAnnotationRegions((prev) =>
			prev.map((r) => (r.id === id ? { ...r, blurIntensity } : r)),
		);
	}, []);

	const handleAnnotationBlurColorChange = useCallback((id: string, blurColor: string) => {
		setAnnotationRegions((prev) => prev.map((r) => (r.id === id ? { ...r, blurColor } : r)));
	}, []);

	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => {
			setAnnotationRegions((prev) => prev.map((r) => (r.id === id ? { ...r, position } : r)));
		},
		[],
	);

	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => {
			setAnnotationRegions((prev) => prev.map((r) => (r.id === id ? { ...r, size } : r)));
		},
		[],
	);

	// ─── Audio handlers ──────────────────────────────────────────────────────
	const handleSelectAudio = useCallback((id: string | null) => {
		setSelectedAudioId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
		}
	}, []);

	const handleAudioAdded = useCallback((span: Span, audioPath: string, trackIndex?: number) => {
		const id = `audio-${nextAudioIdRef.current++}`;
		setAudioRegions((prev) => [
			...prev,
			{
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				audioPath,
				volume: 1,
				trackIndex,
			},
		]);
		setSelectedAudioId(id);
		setSelectedZoomId(null);
		setSelectedAnnotationId(null);
	}, []);

	const handleAudioSpanChange = useCallback((id: string, span: Span) => {
		setAudioRegions((prev) =>
			prev.map((r) =>
				r.id === id
					? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) }
					: r,
			),
		);
	}, []);

	const handleAudioDelete = useCallback((id: string) => {
		setAudioRegions((prev) => prev.filter((r) => r.id !== id));
		setSelectedAudioId((cur) => (cur === id ? null : cur));
	}, []);

	/** Reset ALL region state from a freshly loaded project. */
	const resetForProject = useCallback(
		(editor: {
			zoomRegions: ZoomRegion[];
			clipRegions: ClipRegion[];
			annotationRegions: AnnotationRegion[];
			audioRegions: AudioRegion[];
		}) => {
			setZoomRegions(editor.zoomRegions);
			setClipRegions(editor.clipRegions);
			clipInitializedRef.current = editor.clipRegions.length > 0;
			setAnnotationRegions(editor.annotationRegions);
			setAudioRegions(editor.audioRegions);
			setSelectedZoomId(null);
			setSelectedClipId(null);
			setSelectedAnnotationId(null);
			setSelectedAudioId(null);
			nextZoomIdRef.current = deriveNextId(
				"zoom",
				editor.zoomRegions.map((r) => r.id),
			);
			nextClipIdRef.current = deriveNextId(
				"clip",
				editor.clipRegions.map((r) => r.id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				editor.annotationRegions.map((r) => r.id),
			);
			nextAudioIdRef.current = deriveNextId(
				"audio",
				editor.audioRegions.map((r) => r.id),
			);
			nextAnnotationZIndexRef.current =
				editor.annotationRegions.reduce((max, r) => Math.max(max, r.zIndex), 0) + 1;
		},
		[],
	);

	return {
		// State
		zoomRegions,
		setZoomRegions,
		trimRegions,
		clipRegions,
		setClipRegions,
		annotationRegions,
		setAnnotationRegions,
		audioRegions,
		setAudioRegions,
		// Selections
		selectedZoomId,
		setSelectedZoomId,
		selectedClipId,
		setSelectedClipId,
		selectedAnnotationId,
		setSelectedAnnotationId,
		selectedAudioId,
		setSelectedAudioId,
		// Refs
		nextZoomIdRef,
		nextClipIdRef,
		nextAnnotationIdRef,
		nextAnnotationZIndexRef,
		nextAudioIdRef,
		clipInitializedRef,
		autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef,
		// Derived
		effectiveZoomRegions,
		effectiveSpeedRegions,
		mapTimelineTimeToSourceTime,
		mapSourceTimeToTimelineTime,
		timelinePlayheadTime,
		// Zoom
		handleZoomAdded,
		handleZoomSuggested,
		handleZoomSpanChange,
		handleZoomDelete,
		handleZoomFocusChange,
		handleZoomDepthChange,
		handleZoomModeChange,
		handleSelectZoom,
		// Clip
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		handleClipMutedChange,
		handleClipDelete,
		// Annotation
		handleSelectAnnotation,
		handleAnnotationAdded,
		handleAnnotationSpanChange,
		handleAnnotationDelete,
		handleAnnotationContentChange,
		handleAnnotationTypeChange,
		handleAnnotationStyleChange,
		handleAnnotationFigureDataChange,
		handleAnnotationBlurIntensityChange,
		handleAnnotationBlurColorChange,
		handleAnnotationPositionChange,
		handleAnnotationSizeChange,
		// Audio
		handleSelectAudio,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioDelete,
		// Project reset
		resetForProject,
	};
}
