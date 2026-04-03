import { clampFocusToDepth, ZOOM_DEPTH_SCALES, type ZoomDepth, type ZoomFocus } from "../types";

interface StageSize {
	width: number;
	height: number;
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function easeIntoBoundary(normalized: number) {
	const t = clamp(normalized, 0, 1);
	return -t * t * t + 2 * t * t;
}

function softClampToRange(value: number, min: number, max: number, softness: number) {
	const clamped = clamp(value, min, max);

	if (softness <= 0 || max <= min) {
		return clamped;
	}

	if (clamped < min + softness) {
		const normalized = (clamped - min) / softness;
		return min + softness * easeIntoBoundary(normalized);
	}

	if (clamped > max - softness) {
		const normalized = (max - clamped) / softness;
		return max - softness * easeIntoBoundary(normalized);
	}

	return clamped;
}

function getFocusBounds(depth: ZoomDepth) {
	const zoomScale = ZOOM_DEPTH_SCALES[depth];
	return getFocusBoundsForScale(zoomScale);
}

function getFocusBoundsForScale(zoomScale: number) {
	const marginX = 1 / (2 * zoomScale);
	const marginY = 1 / (2 * zoomScale);

	return {
		minX: marginX,
		maxX: 1 - marginX,
		minY: marginY,
		maxY: 1 - marginY,
	};
}

export function clampFocusToStage(
	focus: ZoomFocus,
	depth: ZoomDepth,
	_stageSize: StageSize,
): ZoomFocus {
	const baseFocus = clampFocusToDepth(focus, depth);
	const bounds = getFocusBounds(depth);

	return {
		cx: clamp(baseFocus.cx, bounds.minX, bounds.maxX),
		cy: clamp(baseFocus.cy, bounds.minY, bounds.maxY),
	};
}

export function clampFocusToScale(focus: ZoomFocus, zoomScale: number): ZoomFocus {
	const baseFocus = {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
	const bounds = getFocusBoundsForScale(zoomScale);

	return {
		cx: clamp(baseFocus.cx, bounds.minX, bounds.maxX),
		cy: clamp(baseFocus.cy, bounds.minY, bounds.maxY),
	};
}

export function softenFocusToScale(focus: ZoomFocus, zoomScale: number): ZoomFocus {
	const baseFocus = {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
	const bounds = getFocusBoundsForScale(zoomScale);
	const horizontalRange = bounds.maxX - bounds.minX;
	const verticalRange = bounds.maxY - bounds.minY;
	const horizontalSoftness = Math.min(0.12, horizontalRange * 0.35);
	const verticalSoftness = Math.min(0.12, verticalRange * 0.35);

	return {
		cx: softClampToRange(baseFocus.cx, bounds.minX, bounds.maxX, horizontalSoftness),
		cy: softClampToRange(baseFocus.cy, bounds.minY, bounds.maxY, verticalSoftness),
	};
}

export function stageFocusToVideoSpace(
	focus: ZoomFocus,
	stageSize: StageSize,
	videoSize: { width: number; height: number },
	baseScale: number,
	baseOffset: { x: number; y: number },
): ZoomFocus {
	if (
		!stageSize.width ||
		!stageSize.height ||
		!videoSize.width ||
		!videoSize.height ||
		baseScale <= 0
	) {
		return focus;
	}

	const stageX = focus.cx * stageSize.width;
	const stageY = focus.cy * stageSize.height;

	const videoNormX = (stageX - baseOffset.x) / (videoSize.width * baseScale);
	const videoNormY = (stageY - baseOffset.y) / (videoSize.height * baseScale);

	return {
		cx: videoNormX,
		cy: videoNormY,
	};
}
