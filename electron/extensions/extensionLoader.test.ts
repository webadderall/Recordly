import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateExtensionInstallSource", () => {
	let tempRoot: string;

	beforeEach(async () => {
		tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-extension-loader-"));
		vi.resetModules();
		vi.doMock("electron", () => ({
			app: {
				getPath: () => tempRoot,
				getAppPath: () => tempRoot,
				isPackaged: false,
			},
		}));
	});

	afterEach(async () => {
		vi.resetModules();
		vi.doUnmock("electron");
		await fs.rm(tempRoot, { recursive: true, force: true });
	});

	it("returns a helpful error when the manifest entry file is missing", async () => {
		const extensionDir = path.join(tempRoot, "extension");
		await fs.mkdir(extensionDir, { recursive: true });
		await fs.writeFile(
			path.join(extensionDir, "recordly-extension.json"),
			JSON.stringify({
				id: "test.extension",
				name: "Test Extension",
				version: "1.0.0",
				main: "dist/index.js",
				permissions: ["cursor"],
			}),
			"utf8",
		);

		const { validateExtensionInstallSource } = await import("./extensionLoader");

		await expect(validateExtensionInstallSource(extensionDir)).resolves.toEqual({
			error: "Entry file not found: dist/index.js",
		});
	});
});