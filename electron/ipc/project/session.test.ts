import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("recording session manifest", () => {
	const tempDirs: string[] = [];
	let appDataPath: string;
	let userDataPath: string;
	let tempPath: string;
	let appPath: string;

	beforeEach(async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-session-root-"));
		tempDirs.push(tempRoot);
		appDataPath = path.join(tempRoot, "AppData");
		userDataPath = path.join(tempRoot, "UserData");
		tempPath = path.join(tempRoot, "Temp");
		appPath = path.join(tempRoot, "App");

		await Promise.all(
			[appDataPath, userDataPath, tempPath, appPath].map((dirPath) =>
				fs.mkdir(dirPath, { recursive: true }),
			),
		);

		vi.resetModules();
		vi.doMock("electron", () => ({
			app: {
				isPackaged: false,
				getAppPath: () => appPath,
				getPath: (name: string) => {
					if (name === "appData") return appDataPath;
					if (name === "userData") return userDataPath;
					if (name === "temp") return tempPath;
					return tempRoot;
				},
				setPath: () => undefined,
			},
		}));
	});

	afterEach(async () => {
		vi.resetModules();
		vi.doUnmock("electron");
		await Promise.all(
			tempDirs.splice(0).map((dirPath) => fs.rm(dirPath, { recursive: true, force: true })),
		);
	});

	it("persists and resolves normalized v3 recording session facts", async () => {
		const { persistRecordingSessionManifest, resolveRecordingSessionManifest } = await import(
			"./session"
		);
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-session-"));
		tempDirs.push(tempRoot);

		const videoPath = path.join(tempRoot, "recording.webm");
		const webcamPath = path.join(tempRoot, "recording-webcam.webm");
		const microphonePath = path.join(tempRoot, "recording.mic.webm");
		const systemAudioPath = path.join(tempRoot, "recording.system.wav");

		await Promise.all([
			fs.writeFile(videoPath, "video", "utf8"),
			fs.writeFile(webcamPath, "webcam", "utf8"),
			fs.writeFile(microphonePath, "microphone", "utf8"),
			fs.writeFile(systemAudioPath, "system", "utf8"),
		]);

		await persistRecordingSessionManifest({
			videoPath,
			webcamPath,
			microphonePath,
			systemAudioPath,
			hasEmbeddedAudio: true,
			pauseSegments: [{ startMs: 100, endMs: 250 }],
			timingOffsets: { webcamTimeOffsetMs: 42 },
			captureBackend: "browser-mediarecorder",
		});

		await expect(resolveRecordingSessionManifest(videoPath)).resolves.toEqual({
			videoPath,
			webcamPath,
			microphonePath,
			systemAudioPath,
			hasEmbeddedAudio: true,
			pauseSegments: [{ startMs: 100, endMs: 250 }],
			timingOffsets: { webcamTimeOffsetMs: 42 },
			captureBackend: "browser-mediarecorder",
		});
	});

	it("derives source audio fallback paths from explicit session facts", () => {
		return import("./session").then(({ getSourceAudioFallbackPathsFromRecordingSession }) => {
		expect(
			getSourceAudioFallbackPathsFromRecordingSession({
				videoPath: "/tmp/video.webm",
				webcamPath: null,
				microphonePath: "/tmp/video.mic.webm",
				systemAudioPath: null,
				hasEmbeddedAudio: true,
				pauseSegments: [],
				timingOffsets: { webcamTimeOffsetMs: 0 },
				captureBackend: "browser-mediarecorder",
			}),
		).toEqual(["/tmp/video.webm", "/tmp/video.mic.webm"]);

		expect(
			getSourceAudioFallbackPathsFromRecordingSession({
				videoPath: "/tmp/video.webm",
				webcamPath: null,
				microphonePath: "/tmp/video.mic.webm",
				systemAudioPath: "/tmp/video.system.wav",
				hasEmbeddedAudio: false,
				pauseSegments: [],
				timingOffsets: { webcamTimeOffsetMs: 0 },
				captureBackend: "windows-wgc",
			}),
		).toEqual(["/tmp/video.system.wav", "/tmp/video.mic.webm"]);

		expect(
			getSourceAudioFallbackPathsFromRecordingSession({
				videoPath: "/tmp/video.webm",
				webcamPath: null,
				microphonePath: null,
				systemAudioPath: null,
				hasEmbeddedAudio: null,
				pauseSegments: [],
				timingOffsets: { webcamTimeOffsetMs: 0 },
				captureBackend: null,
			}),
		).toBeNull();
		});
	});
});