import { describe, expect, it } from "vitest";
import {
	buildEditedTrackSourceAudioFilter,
	buildTrimmedSourceAudioFilter,
} from "./nativeVideoExport";

describe("buildTrimmedSourceAudioFilter", () => {
	it("concatenates trimmed source segments into a single output label", () => {
		expect(
			buildTrimmedSourceAudioFilter([
				{ startMs: 0, endMs: 2_000 },
				{ startMs: 4_000, endMs: 6_000 },
			]),
		).toBe(
			"[1:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS[trimmed_audio_0];" +
				"[1:a]atrim=start=4.000:end=6.000,asetpts=PTS-STARTPTS[trimmed_audio_1];" +
				"[trimmed_audio_0][trimmed_audio_1]concat=n=2:v=0:a=1[aout]",
		);
	});
});

describe("buildEditedTrackSourceAudioFilter", () => {
	it("builds a concat filtergraph that pitch-shifts via asetrate for speed changes", () => {
		const filter = buildEditedTrackSourceAudioFilter(
			[
				{ startMs: 0, endMs: 2_000, speed: 1 },
				{ startMs: 2_000, endMs: 6_000, speed: 1.5 },
			],
			44_100,
		);

		expect(filter).toBe(
			"[1:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS[edited_audio_0];" +
				"[1:a]atrim=start=2.000:end=6.000,asetpts=PTS-STARTPTS,asetrate=66150,aresample=44100[edited_audio_1];" +
				"[edited_audio_0][edited_audio_1]concat=n=2:v=0:a=1[aout]",
		);
	});

	it("builds a filtergraph for slowdown segments by lowering then resampling the source rate", () => {
		const filter = buildEditedTrackSourceAudioFilter(
			[{ startMs: 0, endMs: 2_000, speed: 0.5 }],
			44_100,
		);

		expect(filter).toBe(
			"[1:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS,asetrate=22050,aresample=44100[edited_audio_0];" +
				"[edited_audio_0]anull[aout]",
		);
	});

	it("returns null when the edited-track filtergraph inputs are incomplete", () => {
		expect(buildEditedTrackSourceAudioFilter([], 44_100)).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter(
				[{ startMs: 0, endMs: 2_000, speed: 1.5 }],
				Number.NaN,
			),
		).toBeNull();
	});

	it("returns null when the edited-track segments are malformed", () => {
		expect(
			buildEditedTrackSourceAudioFilter(
				[{ startMs: Number.NaN, endMs: 2_000, speed: 1.5 }],
				44_100,
			),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter([{ startMs: 0, endMs: 2_000, speed: 0 }], 44_100),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter([{ startMs: 0, endMs: 2_000, speed: -1 }], 44_100),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter(
				[{ startMs: 0, endMs: 2_000, speed: Number.NaN }],
				44_100,
			),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter([{ startMs: 0, endMs: 2_000, speed: 1 }], 0.4),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter([{ startMs: -100, endMs: 2_000, speed: 1 }], 44_100),
		).toBeNull();
		expect(
			buildEditedTrackSourceAudioFilter(
				[{ startMs: 0, endMs: 2_000, speed: Number.MAX_SAFE_INTEGER }],
				44_100,
			),
		).toBeNull();
	});
});
