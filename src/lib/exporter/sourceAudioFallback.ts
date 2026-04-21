import { getLocalFilePathFromResource } from "./mediaResource";

export function resolveSourceAudioFallbackPaths(
	videoResource: string | null | undefined,
	sourceAudioFallbackPaths: string[] | null | undefined,
) {
	const normalizedPaths = (sourceAudioFallbackPaths ?? []).filter(
		(audioPath) => typeof audioPath === "string" && audioPath.trim().length > 0,
	);
	const localVideoSourcePath = videoResource
		? getLocalFilePathFromResource(videoResource)
		: null;
	const hasEmbeddedSourceAudio =
		Boolean(localVideoSourcePath) && normalizedPaths.includes(localVideoSourcePath);

	return {
		hasEmbeddedSourceAudio,
		externalAudioPaths: hasEmbeddedSourceAudio
			? normalizedPaths.filter((audioPath) => audioPath !== localVideoSourcePath)
			: normalizedPaths,
	};
}