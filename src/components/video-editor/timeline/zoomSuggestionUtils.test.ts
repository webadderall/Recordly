import { describe, expect, it } from "vitest";

import type { CursorTelemetryPoint } from "../types";
import { buildInteractionZoomSuggestions } from "./zoomSuggestionUtils";

function createSample(
	timeMs: number,
	interactionType: CursorTelemetryPoint["interactionType"] = "move",
	cx = 0.5,
	cy = 0.5,
): CursorTelemetryPoint {
	return { timeMs, interactionType, cx, cy };
}

describe("buildInteractionZoomSuggestions", () => {
	it("creates a zoom from 500ms before the first click through 500ms after the last click", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [
				createSample(100, "move"),
				createSample(2000, "click", 0.25, 0.4),
				createSample(2400, "move", 0.3, 0.45),
			],
			totalMs: 6000,
			defaultDurationMs: 1500,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toEqual([
			{
				start: 1500,
				end: 2500,
				focus: { cx: 0.25, cy: 0.4 },
			},
		]);
	});

	it("groups clicks within 2500ms into the same zoom region", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [
				createSample(0, "move"),
				createSample(1000, "click", 0.2, 0.2),
				createSample(3200, "double-click", 0.8, 0.6),
				createSample(4500, "move", 0.75, 0.5),
			],
			totalMs: 8000,
			defaultDurationMs: 1200,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toEqual([
			{
				start: 500,
				end: 3700,
				focus: { cx: 0.5, cy: 0.4 },
			},
		]);
	});

	it("splits clicks that are more than 2500ms apart into separate zooms", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [
				createSample(0, "move"),
				createSample(1000, "click", 0.1, 0.2),
				createSample(4000, "right-click", 0.9, 0.7),
				createSample(5000, "move", 0.9, 0.7),
			],
			totalMs: 7000,
			defaultDurationMs: 1500,
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toEqual([
			{
				start: 500,
				end: 1500,
				focus: { cx: 0.1, cy: 0.2 },
			},
			{
				start: 3500,
				end: 4500,
				focus: { cx: 0.9, cy: 0.7 },
			},
		]);
	});

	it("skips click-cluster suggestions that overlap reserved spans", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [
				createSample(0, "move"),
				createSample(1000, "click", 0.2, 0.3),
				createSample(5000, "middle-click", 0.7, 0.6),
			],
			totalMs: 7000,
			defaultDurationMs: 1500,
			reservedSpans: [{ start: 450, end: 1800 }],
		});

		expect(result.status).toBe("ok");
		expect(result.suggestions).toEqual([
			{
				start: 4500,
				end: 5500,
				focus: { cx: 0.7, cy: 0.6 },
			},
		]);
	});

	it("returns no-interactions when telemetry has no click events", () => {
		const result = buildInteractionZoomSuggestions({
			cursorTelemetry: [createSample(0), createSample(1200), createSample(2400)],
			totalMs: 3000,
			defaultDurationMs: 1500,
		});

		expect(result).toEqual({ status: "no-interactions", suggestions: [] });
	});
});