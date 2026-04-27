import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExportableVideoUrl, getRenderableVideoUrl } from "./assetPath";

describe("getRenderableVideoUrl", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the local media server for absolute local video paths when available", async () => {
		vi.stubGlobal("window", {
			electronAPI: {
				getLocalMediaUrl: vi.fn(async (filePath: string) => ({
					success: true,
					url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
				})),
			},
		});

		await expect(getRenderableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"http://127.0.0.1:4321/video?path=%2FUsers%2Fegg%2FDesktop%2Fbg.mp4",
		);
	});

	it("falls back to a file URL for absolute local video paths", async () => {
		await expect(getRenderableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"file:///Users/egg/Desktop/bg.mp4",
		);
	});

	it("keeps bundled wallpaper paths routed through the app asset directory", async () => {
		vi.stubGlobal("window", {
			location: {
				protocol: "http:",
			},
		});

		await expect(getRenderableVideoUrl("/wallpapers/wispysky.mp4")).resolves.toBe(
			"/wallpapers/wispysky.mp4",
		);
	});
});

describe("getExportableVideoUrl", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses a direct file URL for absolute local video paths", async () => {
		await expect(getExportableVideoUrl("/Users/egg/Desktop/bg.mp4")).resolves.toBe(
			"file:///Users/egg/Desktop/bg.mp4",
		);
	});

	it("keeps bundled wallpaper paths routed through the app asset directory", async () => {
		vi.stubGlobal("window", {
			location: {
				protocol: "http:",
			},
		});

		await expect(getExportableVideoUrl("/wallpapers/wispysky.mp4")).resolves.toBe(
			"/wallpapers/wispysky.mp4",
		);
	});
});
