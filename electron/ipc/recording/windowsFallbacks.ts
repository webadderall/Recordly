const WINDOWS_MIC_CAPTURE_INIT_WARNING = "WARNING: Failed to initialize WASAPI mic capture";

export function shouldUseWindowsBrowserMicrophoneFallback(
	captureOutput: string,
	options?: { capturesMicrophone?: boolean },
) {
	return (
		Boolean(options?.capturesMicrophone) &&
		captureOutput.includes(WINDOWS_MIC_CAPTURE_INIT_WARNING)
	);
}