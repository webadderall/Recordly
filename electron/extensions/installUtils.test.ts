import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveExtensionManifestDirectory } from "./installUtils";

describe("resolveExtensionManifestDirectory", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
		);
	});

	it("finds a manifest nested multiple directories deep", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-ext-install-"));
		tempDirs.push(rootDir);
		const nestedDir = path.join(rootDir, "package", "dist", "extension");
		await fs.mkdir(nestedDir, { recursive: true });
		await fs.writeFile(path.join(nestedDir, "recordly-extension.json"), "{}", "utf8");

		await expect(resolveExtensionManifestDirectory(rootDir)).resolves.toEqual({
			manifestDir: nestedDir,
		});
	});

	it("ignores macOS junk directories while searching", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-ext-install-"));
		tempDirs.push(rootDir);
		const junkDir = path.join(rootDir, "__MACOSX", "payload");
		const validDir = path.join(rootDir, "extension");
		await fs.mkdir(junkDir, { recursive: true });
		await fs.mkdir(validDir, { recursive: true });
		await fs.writeFile(path.join(junkDir, "recordly-extension.json"), "{}", "utf8");
		await fs.writeFile(path.join(validDir, "recordly-extension.json"), "{}", "utf8");

		await expect(resolveExtensionManifestDirectory(rootDir)).resolves.toEqual({
			manifestDir: validDir,
		});
	});
});