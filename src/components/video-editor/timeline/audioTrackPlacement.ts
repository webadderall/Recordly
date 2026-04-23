import type { AudioRegion } from "../types";

export interface AudioTrackPlacement {
	trackIndex: number;
	availableDurationMs: number;
}

export function findAudioTrackPlacement(
	audioRegions: AudioRegion[],
	startMs: number,
	totalDurationMs: number,
): AudioTrackPlacement | null {
	if (
		!Number.isFinite(startMs) ||
		!Number.isFinite(totalDurationMs) ||
		totalDurationMs <= 0 ||
		startMs < 0 ||
		startMs >= totalDurationMs
	) {
		return null;
	}

	const normalizedRegions = audioRegions.map((region) => ({
		startMs: region.startMs,
		endMs: region.endMs,
		trackIndex: region.trackIndex ?? 0,
	}));
	const maxTrackIndex = normalizedRegions.reduce(
		(max, region) => Math.max(max, region.trackIndex),
		0,
	);

	for (let trackIndex = 0; trackIndex <= maxTrackIndex + 1; trackIndex += 1) {
		const trackRegions = normalizedRegions
			.filter((region) => region.trackIndex === trackIndex)
			.sort((left, right) => left.startMs - right.startMs);
		const nextRegion = trackRegions.find((region) => region.startMs > startMs);
		const availableDurationMs = nextRegion
			? nextRegion.startMs - startMs
			: totalDurationMs - startMs;
		const isOverlapping = trackRegions.some(
			(region) => startMs >= region.startMs && startMs < region.endMs,
		);

		if (!isOverlapping && availableDurationMs > 0) {
			return { trackIndex, availableDurationMs };
		}
	}

	return null;
}
