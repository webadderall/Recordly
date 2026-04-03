import type { CaptionWordState } from "./captionLayout";
import { DEFAULT_AUTO_CAPTION_SETTINGS } from "./types";

export const CAPTION_FONT_WEIGHT = 400;
export const CAPTION_LINE_HEIGHT = 1.32;

const DEFAULT_CAPTION_REFERENCE_WIDTH = 1920 * (DEFAULT_AUTO_CAPTION_SETTINGS.maxWidth / 100);

export function getCaptionTargetWidth(containerWidth: number, maxWidthPercent: number) {
	return Math.max(1, containerWidth * (maxWidthPercent / 100));
}

export function getCaptionScaledFontSize(
	fontSize: number,
	containerWidth: number,
	maxWidthPercent: number,
) {
	return Math.max(
		14,
		fontSize *
			(getCaptionTargetWidth(containerWidth, maxWidthPercent) / DEFAULT_CAPTION_REFERENCE_WIDTH),
	);
}

export function getCaptionPadding(fontSize: number) {
	return {
		x: fontSize * 1.1,
		y: fontSize * 0.78,
	};
}

export function getCaptionScaledRadius(radius: number, fontSize: number) {
	const baseline = Math.max(1, DEFAULT_AUTO_CAPTION_SETTINGS.fontSize);
	return Math.max(0, radius * (fontSize / baseline));
}

export function getCaptionTextMaxWidth(
	containerWidth: number,
	maxWidthPercent: number,
	fontSize: number,
) {
	const padding = getCaptionPadding(fontSize);
	return Math.max(
		fontSize * 4,
		getCaptionTargetWidth(containerWidth, maxWidthPercent) - padding.x * 2,
	);
}

export function getCaptionWordVisualState(hasWordTimings: boolean, state: CaptionWordState) {
	if (!hasWordTimings) {
		return {
			isInactive: false,
			opacity: 1,
		};
	}

	switch (state) {
		case "upcoming":
			return {
				isInactive: true,
				opacity: 0.82,
			};
		case "spoken":
			return {
				isInactive: false,
				opacity: 0.72,
			};
		case "active":
		default:
			return {
				isInactive: false,
				opacity: 1,
			};
	}
}
