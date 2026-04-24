import fs from "node:fs/promises";
import path from "node:path";

export const EXTENSION_MANIFEST_FILE_NAME = "recordly-extension.json";

const IGNORED_EXTENSION_DIR_NAMES = new Set(["__MACOSX", ".git", ".svn"]);
const MAX_MANIFEST_SEARCH_DEPTH = 6;

function shouldSkipManifestSearchDir(name: string) {
	return name.startsWith(".") || IGNORED_EXTENSION_DIR_NAMES.has(name);
}

async function findManifestDirectories(rootDir: string, depth: number): Promise<string[]> {
	if (depth > MAX_MANIFEST_SEARCH_DEPTH) {
		return [];
	}

	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const manifestDirectories: string[] = [];

	if (
		entries.some(
			(entry) => entry.isFile() && entry.name === EXTENSION_MANIFEST_FILE_NAME,
		)
	) {
		manifestDirectories.push(rootDir);
	}

	for (const entry of entries) {
		if (!entry.isDirectory() || shouldSkipManifestSearchDir(entry.name)) {
			continue;
		}

		manifestDirectories.push(
			...(await findManifestDirectories(path.join(rootDir, entry.name), depth + 1)),
		);
	}

	return manifestDirectories;
}

function getManifestDepth(rootDir: string, manifestDir: string) {
	return path.relative(rootDir, manifestDir).split(path.sep).filter(Boolean).length;
}

export async function resolveExtensionManifestDirectory(
	rootDir: string,
): Promise<{ manifestDir: string } | { error: string }> {
	const manifestDirectories = await findManifestDirectories(rootDir, 0);

	if (manifestDirectories.length === 0) {
		return {
			error: `Downloaded extension does not contain a ${EXTENSION_MANIFEST_FILE_NAME} manifest`,
		};
	}

	if (manifestDirectories.length === 1) {
		return { manifestDir: manifestDirectories[0] };
	}

	const shallowestDepth = Math.min(
		...manifestDirectories.map((manifestDir) => getManifestDepth(rootDir, manifestDir)),
	);
	const shallowestMatches = manifestDirectories.filter(
		(manifestDir) => getManifestDepth(rootDir, manifestDir) === shallowestDepth,
	);

	if (shallowestMatches.length === 1) {
		return { manifestDir: shallowestMatches[0] };
	}

	return {
		error: `Downloaded extension contains multiple ${EXTENSION_MANIFEST_FILE_NAME} manifests`,
	};
}