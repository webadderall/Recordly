import { toast } from "sonner";
import type { RecordingCaptureBackend } from "../../../electron/ipc/types";
import { updateRecordingSessionFacts } from "./captureSession";
import { stopMicFallbackRecorder, storeMicrophoneSidecar } from "./audioCapture";
import type { PauseSegment, ScreenRecorderRefs } from "./shared";
import { stopWebcamRecorder } from "./webcamCapture";

export function showRecordingFinalizationToast(
	refs: ScreenRecorderRefs,
	message = "Preparing recording...",
) {
	refs.recordingFinalizationToastId.current = toast.loading(message, {
		id: refs.recordingFinalizationToastId.current ?? undefined,
		duration: Number.POSITIVE_INFINITY,
	});
}

export function clearRecordingFinalizationToast(refs: ScreenRecorderRefs) {
	const toastId = refs.recordingFinalizationToastId.current;
	if (toastId === null) {
		return;
	}

	toast.dismiss(toastId);
	refs.recordingFinalizationToastId.current = null;
}

export async function notifyRecordingFinalizationFailure(
	refs: ScreenRecorderRefs,
	message: string,
) {
	clearRecordingFinalizationToast(refs);
	toast.error(message, { duration: 10000 });
}

export async function logNativeCaptureDiagnostics(context: string) {
	if (typeof window.electronAPI?.getLastNativeCaptureDiagnostics !== "function") {
		return;
	}

	try {
		const result = await window.electronAPI.getLastNativeCaptureDiagnostics();
		if (result.success && result.diagnostics) {
			console.warn(`[NativeCaptureDiagnostics:${context}]`, result.diagnostics);
		}
	} catch (error) {
		console.warn("Failed to load native capture diagnostics:", error);
	}
}

export async function buildNativeCaptureFailureMessage(
	context: string,
	fallbackMessage: string,
) {
	if (typeof window.electronAPI?.getLastNativeCaptureDiagnostics !== "function") {
		return fallbackMessage;
	}

	try {
		const result = await window.electronAPI.getLastNativeCaptureDiagnostics();
		const diagnostics = result.success ? (result.diagnostics ?? null) : null;
		if (!diagnostics) {
			return fallbackMessage;
		}

		console.warn(`[NativeCaptureDiagnostics:${context}]`, diagnostics);

		const details: string[] = [];
		if (diagnostics.error) {
			details.push(diagnostics.error);
		}
		if (diagnostics.outputPath) {
			details.push(`Saved file: ${diagnostics.outputPath}`);
		}

		return details.length > 0 ? `${fallbackMessage} ${details.join(". ")}` : fallbackMessage;
	} catch (error) {
		console.warn("Failed to load native capture diagnostics:", error);
		return fallbackMessage;
	}
}

export async function finalizeRecordingSession(options: {
	refs: ScreenRecorderRefs;
	videoPath: string;
	webcamPath: string | null;
	captureBackend?: RecordingCaptureBackend | null;
	hasEmbeddedAudio?: boolean | null;
	microphonePath?: string | null;
	systemAudioPath?: string | null;
	pauseSegments?: PauseSegment[];
}) {
	updateRecordingSessionFacts(options.refs, {
		captureBackend: options.captureBackend ?? options.refs.recordingSessionFacts.current.captureBackend,
		hasEmbeddedAudio:
			options.hasEmbeddedAudio ?? options.refs.recordingSessionFacts.current.hasEmbeddedAudio,
		microphonePath:
			options.microphonePath ?? options.refs.recordingSessionFacts.current.microphonePath,
		systemAudioPath:
			options.systemAudioPath ?? options.refs.recordingSessionFacts.current.systemAudioPath,
	});

	const session = {
		videoPath: options.videoPath,
		webcamPath: options.webcamPath,
		microphonePath: options.refs.recordingSessionFacts.current.microphonePath,
		systemAudioPath: options.refs.recordingSessionFacts.current.systemAudioPath,
		hasEmbeddedAudio: options.refs.recordingSessionFacts.current.hasEmbeddedAudio,
		pauseSegments: options.pauseSegments ?? options.refs.pauseSegmentsRef.current.slice(),
		timingOffsets: {
			webcamTimeOffsetMs: options.refs.webcamTimeOffsetMs.current,
		},
		captureBackend: options.refs.recordingSessionFacts.current.captureBackend,
	};

	try {
		await window.electronAPI.setCurrentRecordingSession(session);
	} catch (error) {
		console.error("Failed to persist recording session metadata:", error);

		try {
			await window.electronAPI.setCurrentVideoPath(options.videoPath);
		} catch (fallbackError) {
			console.error("Failed to persist fallback video path:", fallbackError);
		}
	}

	clearRecordingFinalizationToast(options.refs);
	await window.electronAPI.switchToEditor();
}

export async function recoverNativeRecordingSession(options: {
	refs: ScreenRecorderRefs;
	micFallbackBlobPromise?: Promise<Blob | null> | null;
	hasEmbeddedAudio?: boolean | null;
}) {
	if (typeof window.electronAPI?.recoverNativeScreenRecording !== "function") {
		return null;
	}

	const result = await window.electronAPI.recoverNativeScreenRecording();
	if (!result.success || !result.path) {
		return null;
	}

	const resolvedMicFallbackBlobPromise =
		options.micFallbackBlobPromise ?? stopMicFallbackRecorder(options.refs);
	const webcamPath = await stopWebcamRecorder(options.refs);
	await storeMicrophoneSidecar({
		refs: options.refs,
		micFallbackBlobPromise: resolvedMicFallbackBlobPromise,
		finalPath: result.path,
	});
	await finalizeRecordingSession({
		refs: options.refs,
		videoPath: result.path,
		webcamPath,
		hasEmbeddedAudio: options.hasEmbeddedAudio,
	});
	return result.path;
}