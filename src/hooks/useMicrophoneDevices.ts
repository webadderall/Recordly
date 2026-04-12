import { useEffect, useRef, useState } from "react";

export interface MicrophoneDevice {
	deviceId: string;
	label: string;
	groupId: string;
}

let hasRequestedMicrophoneLabels = false;
let deviceRefreshCallback: (() => Promise<void>) | null = null;
let deviceChangeTimeout: NodeJS.Timeout | null = null;

export function registerDeviceRefresh(callback: () => Promise<void>) {
	deviceRefreshCallback = callback;
}

export function unregisterDeviceRefresh() {
	deviceRefreshCallback = null;
}

export function forceDeviceRefresh() {
	if (deviceChangeTimeout) {
		clearTimeout(deviceChangeTimeout);
	}
	// Debounce to avoid multiple refreshes on Windows 10 22H2
	deviceChangeTimeout = setTimeout(async () => {
		if (deviceRefreshCallback) {
			try {
				await deviceRefreshCallback();
			} catch (error) {
				console.warn("Device refresh callback failed:", error);
			}
		}
	}, 100);
}

export function useMicrophoneDevices(enabled: boolean = true, preferredDeviceId?: string) {
	const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const loadDevicesRef = useRef<(() => Promise<void>) | null>(null);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		let mounted = true;

		const loadDevices = async () => {
			let permissionStream: MediaStream | null = null;

			try {
				setIsLoading(true);
				setError(null);

				let allDevices = await navigator.mediaDevices.enumerateDevices();
				let audioInputs = allDevices
					.filter((device) => device.kind === "audioinput")
					.map((device) => ({
						deviceId: device.deviceId,
						label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
						groupId: device.groupId,
					}));

				const needsLabelPermission =
					audioInputs.length > 0 && audioInputs.every((device) => !device.label.trim());

				if (needsLabelPermission && !hasRequestedMicrophoneLabels) {
					hasRequestedMicrophoneLabels = true;
					permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
					allDevices = await navigator.mediaDevices.enumerateDevices();
					audioInputs = allDevices
						.filter((device) => device.kind === "audioinput")
						.map((device) => ({
							deviceId: device.deviceId,
							label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
							groupId: device.groupId,
						}));
				}

				if (mounted) {
					setDevices(audioInputs);
					setSelectedDeviceId((currentDeviceId) => {
						const normalizedPreferredDeviceId = preferredDeviceId ?? "default";
						if (audioInputs.some((device) => device.deviceId === normalizedPreferredDeviceId)) {
							return normalizedPreferredDeviceId;
						}

						if (
							currentDeviceId !== "default" &&
							audioInputs.some((device) => device.deviceId === currentDeviceId)
						) {
							return currentDeviceId;
						}

						return (
							audioInputs.find((device) => device.deviceId !== "default")?.deviceId ??
							audioInputs[0]?.deviceId ??
							"default"
						);
					});
					setIsLoading(false);
				}
			} catch (error) {
				if (mounted) {
					const message =
						error instanceof Error ? error.message : "Failed to enumerate audio devices";
					setError(message);
					setIsLoading(false);
					console.error("Error loading microphone devices:", error);
				}
			} finally {
				permissionStream?.getTracks().forEach((track) => track.stop());
			}
		};

		loadDevicesRef.current = loadDevices;

		void loadDevices();

		// Debounced device change handler for Windows 10 22H2 compatibility
		let debounceTimeout: NodeJS.Timeout | null = null;
		const handleDeviceChange = () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			debounceTimeout = setTimeout(() => {
				void loadDevices();
			}, 150);
		};

		navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
		registerDeviceRefresh(loadDevices);

		return () => {
			mounted = false;
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
			unregisterDeviceRefresh();
		};
	}, [enabled, preferredDeviceId]);

	return {
		devices,
		selectedDeviceId,
		setSelectedDeviceId,
		isLoading,
		error,
	};
}
