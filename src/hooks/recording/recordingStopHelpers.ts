import { toast } from "sonner";
import { stopMicFallbackRecorder, storeMicrophoneSidecar } from "./audioCapture";
import {
	buildNativeCaptureFailureMessage,
	finalizeRecordingSession,
	logNativeCaptureDiagnostics,
	notifyRecordingFinalizationFailure,
	recoverNativeRecordingSession,
	showRecordingFinalizationToast,
} from "./recordingFinalizer";
import {
	SOURCE_AUDIO_MUX_TOAST_ID,
	type ScreenRecorderRefs,
} from "./shared";
import { stopWebcamRecorder } from "./webcamCapture";

type StopRecordingOptions = {
	refs: ScreenRecorderRefs;
	setPaused: (paused: boolean) => void;
	setRecording: (recording: boolean) => void;
	isMacOS: boolean;
	markRecordingResumed: (resumedAt: number) => void;
	cleanupCapturedMedia: () => Promise<void>;
};

export async function stopNativeRecordingSession(options: StopRecordingOptions) {
	options.refs.nativeScreenRecording.current = false;
	options.setRecording(false);
	showRecordingFinalizationToast(options.refs);

	const micFallbackBlobPromise = stopMicFallbackRecorder(options.refs);
	const webcamPath = await stopWebcamRecorder(options.refs);
	const isNativeWindows = options.refs.nativeWindowsRecording.current;
	options.markRecordingResumed(Date.now());
	const pauseSegments = options.refs.pauseSegmentsRef.current.slice();
	const sessionFacts = options.refs.recordingSessionFacts.current;
	options.refs.nativeWindowsRecording.current = false;

	const result = await window.electronAPI.stopNativeScreenRecording();
	await window.electronAPI?.setRecordingState(false);

	if (!result.success || !result.path) {
		console.error("Failed to stop native screen recording:", result.error ?? result.message);
		void logNativeCaptureDiagnostics("stop-native-screen-recording");
		try {
			const recoveredPath = await recoverNativeRecordingSession({
				refs: options.refs,
				micFallbackBlobPromise,
				hasEmbeddedAudio: sessionFacts.hasEmbeddedAudio,
			});
			if (recoveredPath) {
				return true;
			}
		} catch (recoveryError) {
			console.error("Failed to recover native screen recording:", recoveryError);
		}

		const failureMessage = await buildNativeCaptureFailureMessage(
			"stop-native-screen-recording",
			options.isMacOS
				? "Failed to finish the macOS recording, so the editor was not opened."
				: "Failed to finish the recording, so the editor was not opened.",
		);
		await notifyRecordingFinalizationFailure(options.refs, failureMessage);
		return true;
	}

	let finalPath = result.path;
	let hasEmbeddedAudio = sessionFacts.hasEmbeddedAudio;

	if (isNativeWindows) {
		const muxResult = await window.electronAPI.muxNativeWindowsRecording(pauseSegments);
		if (!muxResult?.success) {
			void logNativeCaptureDiagnostics("mux-native-windows-recording");
			const warningMessage =
				muxResult?.error ||
				muxResult?.message ||
				"Failed to finish the native Windows audio mux";
			toast.warning(
				`${warningMessage}. Recording was saved, but audio playback or export may be incomplete.`,
				{ id: SOURCE_AUDIO_MUX_TOAST_ID, duration: 10000 },
			);
			hasEmbeddedAudio = null;
		} else {
			hasEmbeddedAudio =
				sessionFacts.requestedSystemAudio ||
				(sessionFacts.requestedMicrophone && !sessionFacts.microphoneFallbackRequired);
		}
		finalPath = muxResult?.path ?? result.path;
	}

	await storeMicrophoneSidecar({
		refs: options.refs,
		micFallbackBlobPromise,
		finalPath,
	});
	await finalizeRecordingSession({
		refs: options.refs,
		videoPath: finalPath,
		webcamPath,
		hasEmbeddedAudio,
		pauseSegments,
	});
	return true;
}

export async function stopBrowserRecordingSession(options: StopRecordingOptions) {
	const recorder = options.refs.mediaRecorder.current;
	const recorderState = recorder?.state;
	if (!recorder || (recorderState !== "recording" && recorderState !== "paused")) {
		return false;
	}

	if (recorderState === "paused") {
		try {
			recorder.resume();
			options.markRecordingResumed(Date.now());
		} catch (error) {
			console.warn("Failed to resume recorder before stopping:", error);
		}
	}

	options.refs.pendingWebcamPathPromise.current = stopWebcamRecorder(options.refs);
	void options.cleanupCapturedMedia();
	recorder.stop();
	options.setRecording(false);
	window.electronAPI?.setRecordingState(false);
	return true;
}