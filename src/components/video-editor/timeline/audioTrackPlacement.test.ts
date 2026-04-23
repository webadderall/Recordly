import { describe, expect, it } from "vitest";

import { findAudioTrackPlacement } from "./audioTrackPlacement";

describe("findAudioTrackPlacement", () => {
	it("places audio on the first track when the playhead is free there", () => {
		expect(
			findAudioTrackPlacement(
				[{ id: "audio-1", startMs: 3_000, endMs: 5_000, audioPath: "a.wav", volume: 1 }],
				1_000,
				10_000,
			),
		).toEqual({ trackIndex: 0, availableDurationMs: 2_000 });
	});

	it("moves audio to the next track when the current track overlaps", () => {
		expect(
			findAudioTrackPlacement(
				[
					{ id: "audio-1", startMs: 0, endMs: 4_000, audioPath: "a.wav", volume: 1 },
					{
						id: "audio-2",
						startMs: 5_000,
						endMs: 7_000,
						audioPath: "b.wav",
						volume: 1,
						trackIndex: 1,
					},
				],
				2_000,
				10_000,
			),
		).toEqual({ trackIndex: 1, availableDurationMs: 3_000 });
	});

	it("creates a new track when all existing tracks overlap at the playhead", () => {
		expect(
			findAudioTrackPlacement(
				[
					{ id: "audio-1", startMs: 0, endMs: 4_000, audioPath: "a.wav", volume: 1 },
					{
						id: "audio-2",
						startMs: 1_000,
						endMs: 6_000,
						audioPath: "b.wav",
						volume: 1,
						trackIndex: 1,
					},
				],
				2_000,
				10_000,
			),
		).toEqual({ trackIndex: 2, availableDurationMs: 8_000 });
	});

	it("returns null when there is no time left in the timeline", () => {
		expect(findAudioTrackPlacement([], 10_000, 10_000)).toBeNull();
	});

	it("returns null for invalid negative start positions", () => {
		expect(findAudioTrackPlacement([], -1, 10_000)).toBeNull();
	});
});
