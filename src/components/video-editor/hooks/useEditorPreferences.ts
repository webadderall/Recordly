import { useState, useMemo, useCallback } from "react";
import {
	loadEditorPreferences,
	saveEditorPreferences as persistPreferences,
} from "../editorPreferences";
import {
	type ExportBackendPreference,
	type ExportEncodingMode,
	type ExportFormat,
	type ExportMp4FrameRate,
	type ExportPipelineModel,
	type ExportQuality,
	type GifFrameRate,
	type GifSizePreset,
} from "@/lib/exporter";
import { type AspectRatio } from "@/utils/aspectRatioUtils";
import {
	type CursorStyle,
	type ZoomTransitionEasing,
	DEFAULT_MP4_EXPORT_FRAME_RATE,
	DEFAULT_ZOOM_IN_DURATION_MS,
	DEFAULT_ZOOM_IN_OVERLAP_MS,
	DEFAULT_ZOOM_OUT_DURATION_MS,
	DEFAULT_CONNECTED_ZOOM_GAP_MS,
	DEFAULT_CONNECTED_ZOOM_DURATION_MS,
	DEFAULT_ZOOM_IN_EASING,
	DEFAULT_ZOOM_OUT_EASING,
	DEFAULT_CONNECTED_ZOOM_EASING,
	DEFAULT_CURSOR_STYLE,
	DEFAULT_ZOOM_SMOOTHNESS,
	type WebcamOverlaySettings,
	DEFAULT_WEBCAM_OVERLAY,
} from "../types";

export function useEditorPreferences() {
	const initialPreferences = useMemo(() => loadEditorPreferences(), []);

	const [wallpaper, setWallpaper] = useState<string>(initialPreferences.wallpaper);
	const [shadowIntensity, setShadowIntensity] = useState(initialPreferences.shadowIntensity);
	const [backgroundBlur, setBackgroundBlur] = useState(initialPreferences.backgroundBlur);
	const [zoomMotionBlur, setZoomMotionBlur] = useState(initialPreferences.zoomMotionBlur);
	const [connectZooms, setConnectZooms] = useState(initialPreferences.connectZooms);
	const [zoomInDurationMs, setZoomInDurationMs] = useState(
		initialPreferences.zoomInDurationMs ?? DEFAULT_ZOOM_IN_DURATION_MS,
	);
	const [zoomInOverlapMs, setZoomInOverlapMs] = useState(
		initialPreferences.zoomInOverlapMs ?? DEFAULT_ZOOM_IN_OVERLAP_MS,
	);
	const [zoomOutDurationMs, setZoomOutDurationMs] = useState(
		initialPreferences.zoomOutDurationMs ?? DEFAULT_ZOOM_OUT_DURATION_MS,
	);
	const [connectedZoomGapMs, setConnectedZoomGapMs] = useState(
		initialPreferences.connectedZoomGapMs ?? DEFAULT_CONNECTED_ZOOM_GAP_MS,
	);
	const [connectedZoomDurationMs, setConnectedZoomDurationMs] = useState(
		initialPreferences.connectedZoomDurationMs ?? DEFAULT_CONNECTED_ZOOM_DURATION_MS,
	);
	const [zoomInEasing, setZoomInEasing] = useState<ZoomTransitionEasing>(
		initialPreferences.zoomInEasing ?? DEFAULT_ZOOM_IN_EASING,
	);
	const [zoomOutEasing, setZoomOutEasing] = useState<ZoomTransitionEasing>(
		initialPreferences.zoomOutEasing ?? DEFAULT_ZOOM_OUT_EASING,
	);
	const [connectedZoomEasing, setConnectedZoomEasing] = useState<ZoomTransitionEasing>(
		initialPreferences.connectedZoomEasing ?? DEFAULT_CONNECTED_ZOOM_EASING,
	);
	const [showCursor, setShowCursor] = useState(initialPreferences.showCursor);
	const [loopCursor, setLoopCursor] = useState(initialPreferences.loopCursor);
	const [cursorStyle, setCursorStyle] = useState<CursorStyle>(
		initialPreferences.cursorStyle ?? DEFAULT_CURSOR_STYLE,
	);
	const [cursorSize, setCursorSize] = useState(initialPreferences.cursorSize);
	const [cursorSmoothing, setCursorSmoothing] = useState(initialPreferences.cursorSmoothing);
	const [zoomSmoothness, setZoomSmoothness] = useState(
		initialPreferences.zoomSmoothness ?? DEFAULT_ZOOM_SMOOTHNESS,
	);
	const [cursorMotionBlur, setCursorMotionBlur] = useState(initialPreferences.cursorMotionBlur);
	const [cursorClickBounce, setCursorClickBounce] = useState(initialPreferences.cursorClickBounce);
	const [cursorClickBounceDuration, setCursorClickBounceDuration] = useState(
		initialPreferences.cursorClickBounceDuration,
	);
	const [cursorSway, setCursorSway] = useState(initialPreferences.cursorSway);
	const [borderRadius, setBorderRadius] = useState(initialPreferences.borderRadius);
	const [padding, setPadding] = useState(initialPreferences.padding);
	const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialPreferences.aspectRatio);
	const [exportQuality, setExportQuality] = useState<ExportQuality>(
		initialPreferences.exportQuality,
	);
	const [exportEncodingMode, setExportEncodingMode] = useState<ExportEncodingMode>(
		initialPreferences.exportEncodingMode,
	);
	const [exportBackendPreference, setExportBackendPreference] = useState<ExportBackendPreference>(
		initialPreferences.exportBackendPreference,
	);
	const [exportPipelineModel, setExportPipelineModel] = useState<ExportPipelineModel>(
		initialPreferences.exportPipelineModel,
	);
	const [mp4FrameRate, setMp4FrameRate] = useState<ExportMp4FrameRate>(
		initialPreferences.mp4FrameRate ?? DEFAULT_MP4_EXPORT_FRAME_RATE,
	);
	const [exportFormat, setExportFormat] = useState<ExportFormat>(
		initialPreferences.exportFormat,
	);
	const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(
		initialPreferences.gifFrameRate,
	);
	const [gifLoop, setGifLoop] = useState(initialPreferences.gifLoop);
	const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>(
		initialPreferences.gifSizePreset,
	);
	const [whisperExecutablePath, setWhisperExecutablePath] = useState<string | null>(
		initialPreferences.whisperExecutablePath,
	);
	const [whisperModelPath, setWhisperModelPath] = useState<string | null>(
		initialPreferences.whisperModelPath,
	);
	const [webcam, setWebcam] = useState<WebcamOverlaySettings>(
		initialPreferences.webcam ?? DEFAULT_WEBCAM_OVERLAY,
	);

	const savePreferences = useCallback(() => {
		persistPreferences({
			wallpaper,
			shadowIntensity,
			backgroundBlur,
			zoomMotionBlur,
			zoomSmoothness,
			connectZooms,
			zoomInDurationMs,
			zoomInOverlapMs,
			zoomOutDurationMs,
			connectedZoomGapMs,
			connectedZoomDurationMs,
			zoomInEasing,
			zoomOutEasing,
			connectedZoomEasing,
			showCursor,
			loopCursor,
			cursorStyle,
			cursorSize,
			cursorSmoothing,
			cursorMotionBlur,
			cursorClickBounce,
			cursorClickBounceDuration,
			cursorSway,
			borderRadius,
			padding,
			aspectRatio,
			exportQuality,
			exportEncodingMode,
			exportBackendPreference,
			exportPipelineModel,
			mp4FrameRate,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
			whisperExecutablePath,
			whisperModelPath,
			webcam,
		});
	}, [
		wallpaper,
		shadowIntensity,
		backgroundBlur,
		zoomMotionBlur,
		zoomSmoothness,
		connectZooms,
		zoomInDurationMs,
		zoomInOverlapMs,
		zoomOutDurationMs,
		connectedZoomGapMs,
		connectedZoomDurationMs,
		zoomInEasing,
		zoomOutEasing,
		connectedZoomEasing,
		showCursor,
		loopCursor,
		cursorStyle,
		cursorSize,
		cursorSmoothing,
		cursorMotionBlur,
		cursorClickBounce,
		cursorClickBounceDuration,
		cursorSway,
		borderRadius,
		padding,
		aspectRatio,
		exportQuality,
		exportEncodingMode,
		exportBackendPreference,
		exportPipelineModel,
		mp4FrameRate,
		exportFormat,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
		whisperExecutablePath,
		whisperModelPath,
		webcam,
	]);

	return {
		preferences: {
			wallpaper,
			shadowIntensity,
			backgroundBlur,
			zoomMotionBlur,
			zoomSmoothness,
			connectZooms,
			zoomInDurationMs,
			zoomInOverlapMs,
			zoomOutDurationMs,
			connectedZoomGapMs,
			connectedZoomDurationMs,
			zoomInEasing,
			zoomOutEasing,
			connectedZoomEasing,
			showCursor,
			loopCursor,
			cursorStyle,
			cursorSize,
			cursorSmoothing,
			cursorMotionBlur,
			cursorClickBounce,
			cursorClickBounceDuration,
			cursorSway,
			borderRadius,
			padding,
			aspectRatio,
			exportQuality,
			exportEncodingMode,
			exportBackendPreference,
			exportPipelineModel,
			mp4FrameRate,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
			whisperExecutablePath,
			whisperModelPath,
			webcam,
		},
		setWallpaper,
		setShadowIntensity,
		setBackgroundBlur,
		setZoomMotionBlur,
		setZoomSmoothness,
		setConnectZooms,
		setZoomInDurationMs,
		setZoomInOverlapMs,
		setZoomOutDurationMs,
		setConnectedZoomGapMs,
		setConnectedZoomDurationMs,
		setZoomInEasing,
		setZoomOutEasing,
		setConnectedZoomEasing,
		setShowCursor,
		setLoopCursor,
		setCursorStyle,
		setCursorSize,
		setCursorSmoothing,
		setCursorMotionBlur,
		setCursorClickBounce,
		setCursorClickBounceDuration,
		setCursorSway,
		setBorderRadius,
		setPadding,
		setAspectRatio,
		setExportQuality,
		setExportEncodingMode,
		setExportBackendPreference,
		setExportPipelineModel,
		setMp4FrameRate,
		setExportFormat,
		setGifFrameRate,
		setGifLoop,
		setGifSizePreset,
		setWhisperExecutablePath,
		setWhisperModelPath,
		setWebcam,
		savePreferences,
	};
}
