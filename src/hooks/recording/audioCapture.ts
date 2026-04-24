import { toast } from "sonner";
import {
	MICROPHONE_FALLBACK_ERROR_TOAST_ID,
	MICROPHONE_SIDECAR_ERROR_TOAST_ID,
	RECORDER_TIMESLICE_MS,
	type ScreenRecorderRefs,
} from "./shared";
import { updateRecordingSessionFacts } from "./captureSession";

export function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

export function getMicrophoneConstraints(microphoneDeviceId: string | undefined) {
	return microphoneDeviceId
		? {
				deviceId: { exact: microphoneDeviceId },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			}
		: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			};
}

export async function startMicrophoneFallbackCapture(options: {
	refs: ScreenRecorderRefs;
	microphoneDeviceId: string | undefined;
}) {
	try {
		const micStream = await navigator.mediaDevices.getUserMedia({
			audio: getMicrophoneConstraints(options.microphoneDeviceId),
			video: false,
		});

		options.refs.micFallbackChunks.current = [];
		const recorder = new MediaRecorder(micStream, {
			mimeType: "audio/webm;codecs=opus",
		});
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				options.refs.micFallbackChunks.current.push(event.data);
			}
		};
		recorder.start(RECORDER_TIMESLICE_MS);
		options.refs.micFallbackRecorder.current = recorder;
		return { success: true as const };
	} catch (error) {
		const message = getErrorMessage(error);
		console.warn("Browser microphone fallback failed:", error);
		toast.error(`${message}. Recording will continue without microphone audio.`, {
			id: MICROPHONE_FALLBACK_ERROR_TOAST_ID,
			duration: 10000,
		});
		return {
			success: false as const,
			error: message,
		};
	}
}

export function stopMicFallbackRecorder(refs: ScreenRecorderRefs): Promise<Blob | null> {
	return new Promise((resolve) => {
		const recorder = refs.micFallbackRecorder.current;
		if (!recorder || recorder.state === "inactive") {
			refs.micFallbackRecorder.current = null;
			resolve(null);
			return;
		}

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				refs.micFallbackChunks.current.push(event.data);
			}
		};
		recorder.onstop = () => {
			const blob =
				refs.micFallbackChunks.current.length > 0
					? new Blob(refs.micFallbackChunks.current, { type: recorder.mimeType })
					: null;
			refs.micFallbackChunks.current = [];
			recorder.stream.getTracks().forEach((track) => track.stop());
			refs.micFallbackRecorder.current = null;
			resolve(blob);
		};
		recorder.stop();
	});
}

export async function storeMicrophoneSidecar(options: {
	refs: ScreenRecorderRefs;
	micFallbackBlobPromise: Promise<Blob | null> | null | undefined;
	finalPath: string;
}) {
	const micFallbackBlob = await options.micFallbackBlobPromise;
	if (!micFallbackBlob) {
		return null;
	}

	try {
		const arrayBuffer = await micFallbackBlob.arrayBuffer();
		const result = await window.electronAPI.storeMicrophoneSidecar(
			arrayBuffer,
			options.finalPath,
		);
		if (!result.success) {
			const errorMessage =
				result.error || "Failed to save the fallback microphone audio track";
			console.warn("Failed to store microphone sidecar:", errorMessage);
			toast.error(
				`${errorMessage}. Recording was saved without the fallback microphone track.`,
				{ id: MICROPHONE_SIDECAR_ERROR_TOAST_ID, duration: 10000 },
			);
			return null;
		}

		updateRecordingSessionFacts(options.refs, {
			microphonePath: result.path ?? null,
		});
		return result.path ?? null;
	} catch (error) {
		console.warn("Failed to store microphone sidecar:", error);
		toast.error(
			`${getErrorMessage(error)}. Recording was saved without the fallback microphone track.`,
			{ id: MICROPHONE_SIDECAR_ERROR_TOAST_ID, duration: 10000 },
		);
		return null;
	}
}