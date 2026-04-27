export const TIMELINE_AXIS_HEIGHT_PX = 32;
export const TIMELINE_ROW_MIN_HEIGHT_PX = 28;
export const TIMELINE_VISIBLE_ROW_COUNT = 2;

function normalizeRowCount(rowCount: number) {
	if (!Number.isFinite(rowCount)) {
		return 0;
	}

	return Math.max(0, Math.floor(rowCount));
}

export function getTimelineRowsMinHeightPx(rowCount: number) {
	return normalizeRowCount(rowCount) * TIMELINE_ROW_MIN_HEIGHT_PX;
}

export function getTimelineContentMinHeightPx(rowCount: number) {
	return TIMELINE_AXIS_HEIGHT_PX + getTimelineRowsMinHeightPx(rowCount);
}

export function getTimelineViewportStretchFactor(rowCount: number) {
	const normalizedRowCount = normalizeRowCount(rowCount);

	if (normalizedRowCount <= 0) {
		return 1;
	}

	return Math.max(1, normalizedRowCount / TIMELINE_VISIBLE_ROW_COUNT);
}
