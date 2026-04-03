export type WindowsCaptureSourceLike = {
	display_id?: string;
};

export type WindowsCaptureDisplayBounds = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type WindowsCaptureDisplayLike = {
	id: number;
	bounds: WindowsCaptureDisplayBounds;
};

export type ResolvedWindowsCaptureDisplay = {
	displayId: number;
	bounds: WindowsCaptureDisplayBounds;
};

export function resolveWindowsCaptureDisplay(
	source: WindowsCaptureSourceLike | null | undefined,
	allDisplays: WindowsCaptureDisplayLike[],
	primaryDisplay: WindowsCaptureDisplayLike,
): ResolvedWindowsCaptureDisplay {
	const requestedDisplayId = Number(source?.display_id);
	const primaryDisplayId = Number(primaryDisplay.id);
	const displayId =
		Number.isFinite(requestedDisplayId) && requestedDisplayId > 0
			? requestedDisplayId
			: primaryDisplayId;

	const matchedDisplay =
		allDisplays.find((display) => String(display.id) === String(displayId)) ?? primaryDisplay;

	return {
		displayId,
		bounds: matchedDisplay.bounds,
	};
}
