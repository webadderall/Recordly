import { describe, expect, it } from "vitest";

import { shouldUseWindowsBrowserMicrophoneFallback } from "./windowsFallbacks";

describe("shouldUseWindowsBrowserMicrophoneFallback", () => {
	it("returns true when native Windows mic initialization fails", () => {
		expect(
			shouldUseWindowsBrowserMicrophoneFallback(
				"WARNING: Failed to initialize WASAPI mic capture\nRecording started",
				{ capturesMicrophone: true },
			),
		).toBe(true);
	});

	it("returns false when microphone capture was not requested", () => {
		expect(
			shouldUseWindowsBrowserMicrophoneFallback(
				"WARNING: Failed to initialize WASAPI mic capture\nRecording started",
				{ capturesMicrophone: false },
			),
		).toBe(false);
	});
});