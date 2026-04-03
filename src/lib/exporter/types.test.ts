import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GifFrameRate, isValidGifFrameRate, VALID_GIF_FRAME_RATES } from "./types";

/**
 * Property 1: Valid Frame Rate Acceptance
 *
 * *For any* frame rate value, the GIF_Exporter SHALL accept it if and only if
 * it is one of the valid presets (15, 20, 25, 30 FPS). Invalid frame rates
 * should be rejected with an error.
 *
 * **Validates: Requirements 2.2**
 *
 * Feature: gif-export, Property 1: Valid Frame Rate Acceptance
 */
describe("GIF Export Types", () => {
	describe("Property 1: Valid Frame Rate Acceptance", () => {
		// Property test: Valid frame rates should be accepted
		it("should accept all valid frame rates (15, 20, 25, 30)", () => {
			fc.assert(
				fc.property(fc.constantFrom(...VALID_GIF_FRAME_RATES), (frameRate: GifFrameRate) => {
					expect(isValidGifFrameRate(frameRate)).toBe(true);
				}),
				{ numRuns: 100 },
			);
		});

		// Property test: Invalid frame rates should be rejected
		it("should reject any frame rate not in the valid set", () => {
			fc.assert(
				fc.property(
					fc.integer().filter((n) => !VALID_GIF_FRAME_RATES.includes(n as GifFrameRate)),
					(invalidFrameRate: number) => {
						expect(isValidGifFrameRate(invalidFrameRate)).toBe(false);
					},
				),
				{ numRuns: 100 },
			);
		});

		// Property test: Frame rate validation is deterministic
		it("should return consistent results for the same input", () => {
			fc.assert(
				fc.property(fc.integer({ min: 1, max: 60 }), (frameRate: number) => {
					const result1 = isValidGifFrameRate(frameRate);
					const result2 = isValidGifFrameRate(frameRate);
					expect(result1).toBe(result2);
				}),
				{ numRuns: 100 },
			);
		});
	});
});
