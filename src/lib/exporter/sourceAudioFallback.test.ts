import { describe, expect, it } from "vitest";

import { resolveSourceAudioFallbackPaths } from "./sourceAudioFallback";

describe("resolveSourceAudioFallbackPaths", () => {
	it("treats the video file path as embedded source audio when present in the fallback list", () => {
		const videoPath = "/tmp/recording.mp4";

		expect(
			resolveSourceAudioFallbackPaths(videoPath, [videoPath, "/tmp/recording.mic.wav"]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["/tmp/recording.mic.wav"],
		});
	});

	it("keeps all fallback paths external when the video has no embedded source audio", () => {
		expect(
			resolveSourceAudioFallbackPaths("/tmp/recording.mp4", [
				"/tmp/recording.system.wav",
				"/tmp/recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: false,
			externalAudioPaths: [
				"/tmp/recording.system.wav",
				"/tmp/recording.mic.wav",
			],
		});
	});

	it("matches embedded source audio when the video resource is a file URL", () => {
		expect(
			resolveSourceAudioFallbackPaths("file:///tmp/recording.mp4", [
				"/tmp/recording.mp4",
				"/tmp/recording.mic.wav",
			]),
		).toEqual({
			hasEmbeddedSourceAudio: true,
			externalAudioPaths: ["/tmp/recording.mic.wav"],
		});
	});
});