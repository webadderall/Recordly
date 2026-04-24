import { useEffect, useRef, type MutableRefObject } from "react";
import { toast } from "sonner";
import { recoverNativeRecordingSession } from "./recordingFinalizer";
import type { ScreenRecorderRefs } from "./shared";

type UseScreenRecorderLifecycleOptions = {
	refs: ScreenRecorderRefs;
	stopRecordingRef: MutableRefObject<() => void>;
	cleanupCapturedMedia: () => Promise<void>;
	setRecording: (recording: boolean) => void;
	setIsMacOS: (isMacOS: boolean) => void;
	setCountdownDelayState: (delay: number) => void;
	setMicrophoneEnabled: (enabled: boolean) => void;
	setMicrophoneDeviceId: (deviceId: string | undefined) => void;
	setSystemAudioEnabled: (enabled: boolean) => void;
};

export function useScreenRecorderLifecycle(options: UseScreenRecorderLifecycleOptions) {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		void (async () => {
			const platform = await window.electronAPI.getPlatform();
			optionsRef.current.setIsMacOS(platform === "darwin");
		})();
	}, []);

	useEffect(() => {
		if (optionsRef.current.refs.countdownDelayLoaded.current) {
			return;
		}
		optionsRef.current.refs.countdownDelayLoaded.current = true;

		void (async () => {
			const result = await window.electronAPI.getCountdownDelay();
			if (result.success && typeof result.delay === "number") {
				optionsRef.current.setCountdownDelayState(result.delay);
			}
		})();
	}, []);

	useEffect(() => {
		if (optionsRef.current.refs.recordingPrefsLoaded.current) {
			return;
		}
		optionsRef.current.refs.recordingPrefsLoaded.current = true;

		void (async () => {
			const result = await window.electronAPI.getRecordingPreferences();
			if (result.success) {
				optionsRef.current.setMicrophoneEnabled(result.microphoneEnabled);
				if (result.microphoneDeviceId) {
					optionsRef.current.setMicrophoneDeviceId(result.microphoneDeviceId);
				}
				optionsRef.current.setSystemAudioEnabled(result.systemAudioEnabled);
			}
		})();
	}, []);

	useEffect(() => {
		let cleanup: (() => void) | undefined;

		if (window.electronAPI?.onStopRecordingFromTray) {
			cleanup = window.electronAPI.onStopRecordingFromTray(() => {
				optionsRef.current.stopRecordingRef.current();
			});
		}

		const removeRecordingStateListener = window.electronAPI?.onRecordingStateChanged?.(
			(state) => {
				optionsRef.current.setRecording(state.recording);
			},
		);

		const removeRecordingInterruptedListener = window.electronAPI?.onRecordingInterrupted?.(
			(state) => {
				void (async () => {
					const currentOptions = optionsRef.current;
					currentOptions.setRecording(false);
					currentOptions.refs.nativeScreenRecording.current = false;
					await currentOptions.cleanupCapturedMedia();
					await window.electronAPI.setRecordingState(false);

					if (state.reason !== "window-unavailable") {
						try {
							const recoveredPath = await recoverNativeRecordingSession({
								refs: currentOptions.refs,
								hasEmbeddedAudio:
									currentOptions.refs.recordingSessionFacts.current.hasEmbeddedAudio,
							});
							if (recoveredPath) {
								return;
							}
						} catch (recoveryError) {
							console.error(
								"Failed to recover interrupted native screen recording:",
								recoveryError,
							);
						}
					}

					if (
						state.reason === "window-unavailable" &&
						!currentOptions.refs.hasPromptedForReselect.current
					) {
						currentOptions.refs.hasPromptedForReselect.current = true;
						alert(state.message);
						await window.electronAPI.openSourceSelector();
					} else {
						console.error(state.message);
						toast.error(state.message);
					}
				})();
			},
		);

		return () => {
			const currentOptions = optionsRef.current;
			cleanup?.();
			removeRecordingStateListener?.();
			removeRecordingInterruptedListener?.();

			if (currentOptions.refs.nativeScreenRecording.current) {
				currentOptions.refs.nativeScreenRecording.current = false;
				void window.electronAPI.stopNativeScreenRecording();
			}

			const recorder = currentOptions.refs.mediaRecorder.current;
			const recorderState = recorder?.state;
			if (recorder && (recorderState === "recording" || recorderState === "paused")) {
				recorder.stop();
			}

			void currentOptions.cleanupCapturedMedia();
		};
	}, []);
}