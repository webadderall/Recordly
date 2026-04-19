const MICROPHONE_TEST_MIME_TYPE_PREFERENCES = ["audio/webm;codecs=opus", "audio/webm"] as const;

type MimeTypeSelectorOptions = {
	isTypeSupported?: (type: string) => boolean;
	canPlayType?: (type: string) => string;
};

export function selectMicrophoneTestMimeType(
	options: MimeTypeSelectorOptions = {},
): string | undefined {
	const isTypeSupported =
		options.isTypeSupported ??
		((type: string) =>
			typeof MediaRecorder !== "undefined" &&
			typeof MediaRecorder.isTypeSupported === "function" &&
			MediaRecorder.isTypeSupported(type));
	const canPlayType =
		options.canPlayType ??
		((type: string) =>
			typeof document !== "undefined" && typeof document.createElement === "function"
				? document.createElement("audio").canPlayType(type)
				: "");

	const supportedTypes = MICROPHONE_TEST_MIME_TYPE_PREFERENCES.filter((type) =>
		isTypeSupported(type),
	);
	const playableType = supportedTypes.find((type) => canPlayType(type) !== "");

	return playableType ?? supportedTypes[0];
}
