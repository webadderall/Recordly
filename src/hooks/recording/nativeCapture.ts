import type { MutableRefObject } from "react";
import { toast } from "sonner";
import { startMicrophoneFallbackCapture } from "./audioCapture";
import { updateRecordingSessionFacts } from "./captureSession";
import {
	MICROPHONE_FALLBACK_TOAST_ID,
	type ScreenRecorderRefs,
} from "./shared";
import { beginWebcamCapture } from "./webcamCapture";

type NativeStartOptions = {
	selectedSource: ProcessedDesktopSource;
	microphoneEnabled: boolean;
	microphoneDeviceId: string | undefined;
	systemAudioEnabled: boolean;
};

export async function resolveNativeCaptureMode(options: {
	selectedSource: ProcessedDesktopSource;
	logNativeCaptureDiagnostics: (context: string) => Promise<void>;
	hasShownNativeWindowsFallbackToast: MutableRefObject<boolean>;
}) {
	const platform = await window.electronAPI.getPlatform();
	const canCaptureSelection =
		options.selectedSource.id?.startsWith("screen:") ||
		options.selectedSource.id?.startsWith("window:");

	const useNativeMacScreenCapture =
		platform === "darwin" &&
		canCaptureSelection &&
		typeof window.electronAPI.startNativeScreenRecording === "function";

	let useNativeWindowsCapture = false;
	if (
		platform === "win32" &&
		canCaptureSelection &&
		typeof window.electronAPI.isNativeWindowsCaptureAvailable === "function"
	) {
		try {
			const nativeWindowsResult = await window.electronAPI.isNativeWindowsCaptureAvailable();
			useNativeWindowsCapture = nativeWindowsResult.available;
			if (!useNativeWindowsCapture && !options.hasShownNativeWindowsFallbackToast.current) {
				await options.logNativeCaptureDiagnostics("is-native-windows-capture-available");
				options.hasShownNativeWindowsFallbackToast.current = true;
				toast.info("Native Windows capture is unavailable. Falling back to browser capture.");
			}
		} catch {
			useNativeWindowsCapture = false;
			if (!options.hasShownNativeWindowsFallbackToast.current) {
				options.hasShownNativeWindowsFallbackToast.current = true;
				toast.info("Unable to check native Windows capture. Falling back to browser capture.");
			}
		}
	}

	return { platform, useNativeMacScreenCapture, useNativeWindowsCapture };
}

export async function startNativeRecording(options: NativeStartOptions) {
	let micLabel: string | undefined;
	if (options.microphoneEnabled) {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const mic = devices.find(
				(device) =>
					device.deviceId === options.microphoneDeviceId && device.kind === "audioinput",
			);
			micLabel = mic?.label || undefined;
		} catch {
			// native process will use the default mic
		}
	}

	return window.electronAPI.startNativeScreenRecording(options.selectedSource, {
		capturesSystemAudio: options.systemAudioEnabled,
		capturesMicrophone: options.microphoneEnabled,
		microphoneDeviceId: options.microphoneDeviceId,
		microphoneLabel: micLabel,
	});
}

export async function handleSuccessfulNativeStart(options: {
	refs: ScreenRecorderRefs;
	useNativeWindowsCapture: boolean;
	microphoneEnabled: boolean;
	microphoneDeviceId: string | undefined;
	systemAudioEnabled: boolean;
	nativeResult: Awaited<ReturnType<typeof window.electronAPI.startNativeScreenRecording>>;
	setRecording: (recording: boolean) => void;
	resetRecordingClock: (startedAt: number) => void;
	logNativeCaptureDiagnostics: (context: string) => Promise<void>;
}) {
	const mainStartedAt = Date.now();
	beginWebcamCapture(options.refs);
	options.refs.nativeScreenRecording.current = true;
	options.refs.nativeWindowsRecording.current = options.useNativeWindowsCapture;
	options.resetRecordingClock(mainStartedAt);
	options.refs.webcamTimeOffsetMs.current =
		options.refs.webcamStartTime.current === null
			? 0
			: options.refs.webcamStartTime.current - mainStartedAt;

	updateRecordingSessionFacts(options.refs, {
		captureBackend: options.useNativeWindowsCapture ? "windows-wgc" : "mac-screencapturekit",
		requestedMicrophone: options.microphoneEnabled,
		requestedSystemAudio: options.systemAudioEnabled,
		microphoneFallbackRequired: Boolean(options.nativeResult.microphoneFallbackRequired),
		hasEmbeddedAudio: options.useNativeWindowsCapture
			? null
			: options.systemAudioEnabled ||
				(options.microphoneEnabled && !options.nativeResult.microphoneFallbackRequired),
		microphonePath: null,
		systemAudioPath: null,
	});

	if (options.nativeResult.microphoneFallbackRequired && options.microphoneEnabled) {
		await options.logNativeCaptureDiagnostics("start-browser-microphone-fallback");
		toast.warning(
			"Native microphone capture is unavailable. Using browser microphone fallback for this recording.",
			{ id: MICROPHONE_FALLBACK_TOAST_ID, duration: 8000 },
		);
		await startMicrophoneFallbackCapture({
			refs: options.refs,
			microphoneDeviceId: options.microphoneDeviceId,
		});
	}

	options.setRecording(true);
	window.electronAPI?.setRecordingState(true);
}