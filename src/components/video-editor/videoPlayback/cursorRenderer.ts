import { Assets, Texture } from "pixi.js";
import minimalCursorUrl from "../../../../Minimal Cursor.svg";
import amongusDefaultCursorUrl from "../../../assets/cursors/amongus/default.png";
import amongusPointerCursorUrl from "../../../assets/cursors/amongus/pointer.png";
import chooperDefaultCursorUrl from "../../../assets/cursors/chooper/default.png";
import chooperPointerCursorUrl from "../../../assets/cursors/chooper/pointer.png";
import lavenderDefaultCursorUrl from "../../../assets/cursors/lavender/default.png";
import lavenderPointerCursorUrl from "../../../assets/cursors/lavender/pointer.png";
import parchedDefaultCursorUrl from "../../../assets/cursors/parched/default.png";
import parchedPointerCursorUrl from "../../../assets/cursors/parched/pointer.png";
import turtleDefaultCursorUrl from "../../../assets/cursors/turtle/default.png";
import turtlePointerCursorUrl from "../../../assets/cursors/turtle/pointer.png";
import {
	type CursorStyle,
	type CursorTelemetryPoint,
	DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	DEFAULT_CURSOR_STYLE,
} from "../types";

import { type CursorViewportRect, projectCursorPositionToViewport } from "./cursorViewport";
import {
	createSpringState,
	getCursorSpringConfig,
	resetSpringState,
	stepSpringValue,
} from "./motionSmoothing";
import { UPLOADED_CURSOR_SAMPLE_SIZE, uploadedCursorAssets } from "./uploadedCursorAssets";

type CursorAssetKey = NonNullable<CursorTelemetryPoint["cursorType"]>;
type StatefulCursorStyle = Extract<CursorStyle, "tahoe" | "mono">;
type SingleCursorStyle = Extract<CursorStyle, "dot" | "figma">;
type CursorPackStyle = Exclude<CursorStyle, StatefulCursorStyle | SingleCursorStyle>;
type CursorPackVariant = "default" | "pointer";

type LoadedCursorAsset = {
	texture: Texture;
	image: HTMLImageElement;
	aspectRatio: number;
	anchorX: number;
	anchorY: number;
};

type LoadedCursorPackAssets = Record<CursorPackVariant, LoadedCursorAsset>;

type CursorPackSource = {
	defaultUrl: string;
	pointerUrl: string;
	defaultAnchor: { x: number; y: number };
	pointerAnchor: { x: number; y: number };
};

/**
 * Configuration for cursor rendering.
 */
export interface CursorRenderConfig {
	/** Base cursor height in pixels (at reference width of 1920px) */
	dotRadius: number;
	/** Cursor fill color (hex number for PixiJS) */
	dotColor: number;
	/** Cursor opacity (0–1) */
	dotAlpha: number;
	/** Unused, kept for interface compatibility */
	trailLength: number;
	/** Smoothing factor for cursor interpolation (0–1, lower = smoother/slower) */
	smoothingFactor: number;
	/** Directional cursor motion blur amount. */
	motionBlur: number;
	/** Click bounce multiplier. */
	clickBounce: number;
	/** Click bounce duration in milliseconds. */
	clickBounceDuration: number;
	/** Cursor sway multiplier. */
	sway: number;
	/** Cursor visual style. */
	style: CursorStyle;
}

export const DEFAULT_CURSOR_CONFIG: CursorRenderConfig = {
	dotRadius: 28,
	dotColor: 0xffffff,
	dotAlpha: 0.95,
	trailLength: 0,
	smoothingFactor: 0.18,
	motionBlur: 0,
	clickBounce: 1,
	clickBounceDuration: DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	sway: 0,
	style: DEFAULT_CURSOR_STYLE,
};

const REFERENCE_WIDTH = 1920;
const MIN_CURSOR_VIEWPORT_SCALE = 0.55;
const CLICK_RING_FADE_MS = 240;
const CURSOR_SVG_DROP_SHADOW_FILTER = "drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.35))";

let cursorAssetsPromise: Promise<void> | null = null;
let loadedCursorAssets: Partial<Record<CursorAssetKey, LoadedCursorAsset>> = {};
let loadedInvertedCursorAssets: Partial<Record<CursorAssetKey, LoadedCursorAsset>> = {};
let loadedCursorStyleAssets: Partial<Record<SingleCursorStyle, LoadedCursorAsset>> = {};
let loadedCursorPackAssets: Partial<Record<CursorPackStyle, LoadedCursorPackAssets>> = {};
const warnedMissingCursorPackStyles = new Set<CursorPackStyle>();
const SUPPORTED_CURSOR_KEYS: CursorAssetKey[] = [
	"arrow",
	"text",
	"pointer",
	"crosshair",
	"open-hand",
	"closed-hand",
	"resize-ew",
	"resize-ns",
	"not-allowed",
];

const DEFAULT_CURSOR_PACK_ANCHOR = { x: 0.08, y: 0.08 } as const;
const POINTER_CURSOR_PACK_ANCHOR = { x: 0.48, y: 0.1 } as const;
const CENTERED_CURSOR_PACK_ANCHOR = { x: 0.5, y: 0.5 } as const;
const CURSOR_PACK_POINTER_TYPES = new Set<CursorAssetKey>(["pointer", "open-hand", "closed-hand"]);
const CURSOR_PACK_SOURCES: Record<CursorPackStyle, CursorPackSource> = {
	lavender: {
		defaultUrl: lavenderDefaultCursorUrl,
		pointerUrl: lavenderPointerCursorUrl,
		defaultAnchor: DEFAULT_CURSOR_PACK_ANCHOR,
		pointerAnchor: POINTER_CURSOR_PACK_ANCHOR,
	},
	parched: {
		defaultUrl: parchedDefaultCursorUrl,
		pointerUrl: parchedPointerCursorUrl,
		defaultAnchor: DEFAULT_CURSOR_PACK_ANCHOR,
		pointerAnchor: POINTER_CURSOR_PACK_ANCHOR,
	},
	chooper: {
		defaultUrl: chooperDefaultCursorUrl,
		pointerUrl: chooperPointerCursorUrl,
		defaultAnchor: DEFAULT_CURSOR_PACK_ANCHOR,
		pointerAnchor: POINTER_CURSOR_PACK_ANCHOR,
	},
	amongus: {
		defaultUrl: amongusDefaultCursorUrl,
		pointerUrl: amongusPointerCursorUrl,
		defaultAnchor: CENTERED_CURSOR_PACK_ANCHOR,
		pointerAnchor: CENTERED_CURSOR_PACK_ANCHOR,
	},
	turtle: {
		defaultUrl: turtleDefaultCursorUrl,
		pointerUrl: turtlePointerCursorUrl,
		defaultAnchor: CENTERED_CURSOR_PACK_ANCHOR,
		pointerAnchor: CENTERED_CURSOR_PACK_ANCHOR,
	},
};

function isStatefulCursorStyle(style: CursorStyle): style is StatefulCursorStyle {
	return style === "tahoe" || style === "mono";
}

function isSingleCursorStyle(style: CursorStyle): style is SingleCursorStyle {
	return style === "dot" || style === "figma";
}

function resolveCursorPackVariant(cursorType: CursorAssetKey): CursorPackVariant {
	return CURSOR_PACK_POINTER_TYPES.has(cursorType) ? "pointer" : "default";
}

async function createCursorStyleAsset(style: SingleCursorStyle): Promise<LoadedCursorAsset> {
	if (style === "figma") {
		const image = await loadImage(minimalCursorUrl);
		const sourceCanvas = document.createElement("canvas");
		sourceCanvas.width = image.naturalWidth;
		sourceCanvas.height = image.naturalHeight;
		const sourceCtx = sourceCanvas.getContext("2d")!;
		sourceCtx.drawImage(image, 0, 0);
		const trimmed = trimCanvasToAlpha(sourceCanvas, { x: 40, y: 22 });
		await Assets.load(trimmed.dataUrl);
		const trimmedImage = await loadImage(trimmed.dataUrl);
		const texture = Texture.from(trimmed.dataUrl);

		return {
			texture,
			image: trimmedImage,
			aspectRatio: trimmed.height > 0 ? trimmed.width / trimmed.height : 1,
			anchorX: trimmed.hotspot && trimmed.width > 0 ? trimmed.hotspot.x / trimmed.width : 0,
			anchorY: trimmed.hotspot && trimmed.height > 0 ? trimmed.hotspot.y / trimmed.height : 0,
		};
	}

	const canvas = document.createElement("canvas");
	canvas.width = 112;
	canvas.height = 112;
	const ctx = canvas.getContext("2d")!;
	const cx = canvas.width / 2;
	const cy = canvas.height / 2;
	const radius = 26;
	ctx.fillStyle = "#ffffff";
	ctx.strokeStyle = "rgba(15, 23, 42, 0.88)";
	ctx.lineWidth = 10;
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	const dataUrl = canvas.toDataURL("image/png");
	await Assets.load(dataUrl);
	const image = await loadImage(dataUrl);
	const texture = Texture.from(dataUrl);

	return {
		texture,
		image,
		aspectRatio: canvas.height > 0 ? canvas.width / canvas.height : 1,
		anchorX: 0.5,
		anchorY: 0.5,
	};
}

async function createCursorPackAsset(
	url: string,
	anchor: { x: number; y: number },
): Promise<LoadedCursorAsset> {
	await Assets.load(url);
	const image = await loadImage(url);
	const texture = Texture.from(url);

	return {
		texture,
		image,
		aspectRatio: image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1,
		anchorX: clamp(anchor.x, 0, 1),
		anchorY: clamp(anchor.y, 0, 1),
	};
}

function loadImage(dataUrl: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () =>
			reject(new Error(`Failed to load cursor image: ${dataUrl.slice(0, 128)}`));
		image.src = dataUrl;
	});
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function trimCanvasToAlpha(canvas: HTMLCanvasElement, hotspot?: { x: number; y: number }) {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width: canvas.width,
			height: canvas.height,
			hotspot,
		};
	}

	const { width, height } = canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const { data } = imageData;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const alpha = data[(y * width + x) * 4 + 3];
			if (alpha === 0) {
				continue;
			}

			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	if (maxX < minX || maxY < minY) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width,
			height,
			hotspot,
		};
	}

	const croppedWidth = maxX - minX + 1;
	const croppedHeight = maxY - minY + 1;
	const croppedCanvas = document.createElement("canvas");
	croppedCanvas.width = croppedWidth;
	croppedCanvas.height = croppedHeight;
	const croppedCtx = croppedCanvas.getContext("2d")!;
	croppedCtx.drawImage(
		canvas,
		minX,
		minY,
		croppedWidth,
		croppedHeight,
		0,
		0,
		croppedWidth,
		croppedHeight,
	);

	return {
		dataUrl: croppedCanvas.toDataURL("image/png"),
		width: croppedWidth,
		height: croppedHeight,
		hotspot: hotspot
			? {
					x: hotspot.x - minX,
					y: hotspot.y - minY,
				}
			: undefined,
	};
}

async function createInvertedCursorAsset(asset: LoadedCursorAsset): Promise<LoadedCursorAsset> {
	const canvas = document.createElement("canvas");
	canvas.width = asset.image.naturalWidth;
	canvas.height = asset.image.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(asset.image, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const { data } = imageData;
	for (let index = 0; index < data.length; index += 4) {
		if (data[index + 3] === 0) {
			continue;
		}

		data[index] = 255 - data[index];
		data[index + 1] = 255 - data[index + 1];
		data[index + 2] = 255 - data[index + 2];
	}
	ctx.putImageData(imageData, 0, 0);

	const dataUrl = canvas.toDataURL("image/png");
	await Assets.load(dataUrl);
	const image = await loadImage(dataUrl);
	const texture = Texture.from(dataUrl);

	return {
		texture,
		image,
		aspectRatio: asset.aspectRatio,
		anchorX: asset.anchorX,
		anchorY: asset.anchorY,
	};
}

function getNormalizedAnchor(
	systemAsset: SystemCursorAsset | undefined,
	fallbackAnchor: { x: number; y: number },
) {
	if (!systemAsset || systemAsset.width <= 0 || systemAsset.height <= 0) {
		return fallbackAnchor;
	}

	return {
		x: clamp(systemAsset.hotspotX / systemAsset.width, 0, 1),
		y: clamp(systemAsset.hotspotY / systemAsset.height, 0, 1),
	};
}

/**
 * Loads an SVG at `sampleSize × sampleSize`, crops the trim region out of it,
 * and returns a PNG data-URL of the cropped result. This is required because
 * SVG files have their own natural pixel size (e.g. 32×32) which does not
 * match the 1024-sample coordinate space used by the trim measurements.
 */
async function rasterizeAndCropSvg(
	url: string,
	sampleSize: number,
	trimX: number,
	trimY: number,
	trimWidth: number,
	trimHeight: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
	const img = await loadImage(url);

	// Draw at full sample size
	const srcCanvas = document.createElement("canvas");
	srcCanvas.width = sampleSize;
	srcCanvas.height = sampleSize;
	const srcCtx = srcCanvas.getContext("2d")!;
	srcCtx.drawImage(img, 0, 0, sampleSize, sampleSize);

	// Crop to trim bounds
	const dstCanvas = document.createElement("canvas");
	dstCanvas.width = trimWidth;
	dstCanvas.height = trimHeight;
	const dstCtx = dstCanvas.getContext("2d")!;
	dstCtx.drawImage(srcCanvas, trimX, trimY, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);

	return {
		dataUrl: dstCanvas.toDataURL("image/png"),
		width: dstCanvas.width,
		height: dstCanvas.height,
	};
}

function getCursorAsset(key: CursorAssetKey): LoadedCursorAsset {
	const asset = loadedCursorAssets[key];
	if (!asset) {
		throw new Error(`Missing cursor asset for ${key}`);
	}

	return asset;
}

function getAvailableCursorKeys(): CursorAssetKey[] {
	const loadedKeys = Object.keys(loadedCursorAssets) as CursorAssetKey[];
	return loadedKeys.length > 0 ? loadedKeys : ["arrow"];
}

function getCursorStyleAsset(style: SingleCursorStyle) {
	const asset = loadedCursorStyleAssets[style];
	if (!asset) {
		throw new Error(`Missing cursor style asset for ${style}`);
	}

	return asset;
}

function getCursorPackStyleAsset(style: CursorPackStyle, key: CursorAssetKey) {
	const styleAssets = loadedCursorPackAssets[style];
	if (!styleAssets) {
		if (!warnedMissingCursorPackStyles.has(style)) {
			warnedMissingCursorPackStyles.add(style);
			console.warn(
				`[CursorRenderer] Missing cursor pack assets for ${style}; falling back to Tahoe cursors.`,
			);
		}
		return getStatefulCursorAsset("tahoe", key);
	}

	const variant = resolveCursorPackVariant(key);
	return styleAssets[variant] ?? styleAssets.default;
}

function getStatefulCursorAsset(style: StatefulCursorStyle, key: CursorAssetKey) {
	const assetMap = style === "mono" ? loadedInvertedCursorAssets : loadedCursorAssets;
	const asset = assetMap[key] ?? assetMap.arrow;
	if (!asset) {
		throw new Error(`Missing ${style} cursor asset for ${key}`);
	}

	return asset;
}

export async function preloadCursorAssets() {
	if (!cursorAssetsPromise) {
		cursorAssetsPromise = (async () => {
			const isLinux = typeof navigator !== "undefined" && /linux/i.test(navigator.platform);
			let systemCursors: Record<string, SystemCursorAsset> = {};

			try {
				const result = await window.electronAPI.getSystemCursorAssets();
				if (result.success && result.cursors) {
					systemCursors = result.cursors;
				}
			} catch (error) {
				console.warn("[CursorRenderer] Failed to fetch system cursor assets:", error);
			}

			const entries = await Promise.all(
				SUPPORTED_CURSOR_KEYS.map(async (key) => {
					const systemAsset = systemCursors[key];
					const uploadedAsset = uploadedCursorAssets[key];
					const assetUrl = isLinux
						? uploadedAsset?.url
						: (uploadedAsset?.url ?? systemAsset?.dataUrl);

					if (!assetUrl) {
						console.warn(`[CursorRenderer] No cursor image for: ${key}`);
						return null;
					}

					try {
						let finalUrl: string;
						let width: number;
						let height: number;
						let normalizedAnchor: { x: number; y: number };

						if (uploadedAsset) {
							const { trim } = uploadedAsset;
							const rasterized = await rasterizeAndCropSvg(
								assetUrl,
								UPLOADED_CURSOR_SAMPLE_SIZE,
								trim.x,
								trim.y,
								trim.width,
								trim.height,
							);
							finalUrl = rasterized.dataUrl;
							width = rasterized.width;
							height = rasterized.height;
							normalizedAnchor = {
								x: clamp((uploadedAsset.fallbackAnchor.x * trim.width) / width, 0, 1),
								y: clamp((uploadedAsset.fallbackAnchor.y * trim.height) / height, 0, 1),
							};
						} else {
							finalUrl = assetUrl;
							const img = await loadImage(finalUrl);
							width = img.naturalWidth;
							height = img.naturalHeight;
							normalizedAnchor = getNormalizedAnchor(systemAsset, {
								x: 0,
								y: 0,
							});
						}

						await Assets.load(finalUrl);
						const image = await loadImage(finalUrl);
						const texture = Texture.from(finalUrl);

						return [
							key,
							{
								texture,
								image,
								aspectRatio: height > 0 ? width / height : 1,
								anchorX: normalizedAnchor.x,
								anchorY: normalizedAnchor.y,
							} satisfies LoadedCursorAsset,
						] as const;
					} catch (error) {
						console.warn(`[CursorRenderer] Failed to load cursor image for: ${key}`, error);
						return null;
					}
				}),
			);

			loadedCursorAssets = Object.fromEntries(
				entries.filter(Boolean).map((entry) => entry!),
			) as Partial<Record<CursorAssetKey, LoadedCursorAsset>>;

			const invertedEntries = await Promise.all(
				(Object.entries(loadedCursorAssets) as Array<[CursorAssetKey, LoadedCursorAsset]>).map(
					async ([key, asset]) => [key, await createInvertedCursorAsset(asset)] as const,
				),
			);

			loadedInvertedCursorAssets = Object.fromEntries(invertedEntries) as Partial<
				Record<CursorAssetKey, LoadedCursorAsset>
			>;

			const customStyleEntries = await Promise.all(
				(["dot", "figma"] as const).map(
					async (style) => [style, await createCursorStyleAsset(style)] as const,
				),
			);

			loadedCursorStyleAssets = Object.fromEntries(customStyleEntries) as Partial<
				Record<SingleCursorStyle, LoadedCursorAsset>
			>;

			const cursorPackEntries = await Promise.all(
				(Object.entries(CURSOR_PACK_SOURCES) as Array<[CursorPackStyle, CursorPackSource]>).map(
					async ([style, source]) => {
						try {
							const [defaultAsset, pointerAsset] = await Promise.all([
								createCursorPackAsset(source.defaultUrl, source.defaultAnchor),
								createCursorPackAsset(source.pointerUrl, source.pointerAnchor),
							]);
							return [style, { default: defaultAsset, pointer: pointerAsset }] as const;
						} catch (error) {
							console.warn(
								`[CursorRenderer] Failed to load cursor pack style for: ${style}`,
								error,
							);
							return null;
						}
					},
				),
			);

			loadedCursorPackAssets = Object.fromEntries(
				cursorPackEntries.filter(Boolean).map((entry) => entry!),
			) as Partial<Record<CursorPackStyle, LoadedCursorPackAssets>>;

			if (!loadedCursorAssets.arrow) {
				throw new Error("Failed to initialize the fallback arrow cursor asset");
			}
		})();
	}

	return cursorAssetsPromise;
}

/**
 * Interpolates cursor position from telemetry samples at a given time.
 * Uses linear interpolation between the two nearest samples.
 */
export function interpolateCursorPosition(
	samples: CursorTelemetryPoint[],
	timeMs: number,
): { cx: number; cy: number } | null {
	if (!samples || samples.length === 0) return null;

	if (timeMs <= samples[0].timeMs) {
		return { cx: samples[0].cx, cy: samples[0].cy };
	}

	if (timeMs >= samples[samples.length - 1].timeMs) {
		return {
			cx: samples[samples.length - 1].cx,
			cy: samples[samples.length - 1].cy,
		};
	}

	let lo = 0;
	let hi = samples.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (samples[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid;
		}
	}

	const a = samples[lo];
	const b = samples[hi];
	const span = b.timeMs - a.timeMs;
	if (span <= 0) return { cx: a.cx, cy: a.cy };

	const t = (timeMs - a.timeMs) / span;
	return {
		cx: a.cx + (b.cx - a.cx) * t,
		cy: a.cy + (b.cy - a.cy) * t,
	};
}

function findLatestSample(samples: CursorTelemetryPoint[], timeMs: number) {
	if (samples.length === 0) return null;

	let lo = 0;
	let hi = samples.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (samples[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}

	return samples[lo]?.timeMs <= timeMs ? samples[lo] : null;
}

function findLatestInteractionSample(samples: CursorTelemetryPoint[], timeMs: number) {
	for (let index = samples.length - 1; index >= 0; index -= 1) {
		const sample = samples[index];
		if (sample.timeMs > timeMs) {
			continue;
		}

		if (
			sample.interactionType === "click" ||
			sample.interactionType === "double-click" ||
			sample.interactionType === "right-click" ||
			sample.interactionType === "middle-click"
		) {
			return sample;
		}
	}

	return null;
}

function findLatestStableCursorType(samples: CursorTelemetryPoint[], timeMs: number) {
	// Binary search to find position at timeMs, then scan backwards
	let lo = 0;
	let hi = samples.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (samples[mid].timeMs <= timeMs) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}

	// Scan backwards from the position to find a sample with cursorType
	// Skip click events only (not mouseup) to avoid transient re-type during clicks
	for (let index = lo; index >= 0; index -= 1) {
		const sample = samples[index];
		if (sample.timeMs > timeMs) {
			continue;
		}

		if (!sample.cursorType) {
			continue;
		}

		if (
			sample.interactionType === "click" ||
			sample.interactionType === "double-click" ||
			sample.interactionType === "right-click" ||
			sample.interactionType === "middle-click"
		) {
			continue;
		}

		return sample.cursorType;
	}

	return findLatestSample(samples, timeMs)?.cursorType ?? "arrow";
}

function getCursorViewportScale(viewport: CursorViewportRect) {
	return Math.max(MIN_CURSOR_VIEWPORT_SCALE, viewport.width / REFERENCE_WIDTH);
}



function getCursorVisualState(
	samples: CursorTelemetryPoint[],
	timeMs: number,
	clickBounceDuration: number,
) {
	const latestClick = findLatestInteractionSample(samples, timeMs);
	const interactionType = latestClick?.interactionType;
	const ageMs = latestClick ? Math.max(0, timeMs - latestClick.timeMs) : Number.POSITIVE_INFINITY;
	const isClickEvent =
		interactionType === "click" ||
		interactionType === "double-click" ||
		interactionType === "right-click" ||
		interactionType === "middle-click";
	const clickBounceProgress =
		latestClick && isClickEvent && ageMs <= clickBounceDuration
			? 1 - ageMs / clickBounceDuration
			: 0;

	return {
		cursorType: findLatestStableCursorType(samples, timeMs),
		clickBounceProgress,
		clickProgress:
			latestClick && isClickEvent && ageMs <= CLICK_RING_FADE_MS
				? 1 - ageMs / CLICK_RING_FADE_MS
				: 0,
	};
}

/**
 * Manages a smoothed cursor state that chases the interpolated target.
 */
export class SmoothedCursorState {
	public x = 0.5;
	public y = 0.5;
	public trail: Array<{ x: number; y: number }> = [];
	private smoothingFactor: number;
	private trailLength: number;
	private initialized = false;
	private lastTimeMs: number | null = null;
	private xSpring = createSpringState(0.5);
	private ySpring = createSpringState(0.5);

	constructor(config: Pick<CursorRenderConfig, "smoothingFactor" | "trailLength">) {
		this.smoothingFactor = config.smoothingFactor;
		this.trailLength = config.trailLength;
	}

	update(targetX: number, targetY: number, timeMs: number): void {
		if (!this.initialized) {
			this.x = targetX;
			this.y = targetY;
			this.initialized = true;
			this.lastTimeMs = timeMs;
			this.xSpring.value = targetX;
			this.ySpring.value = targetY;
			this.xSpring.velocity = 0;
			this.ySpring.velocity = 0;
			this.xSpring.initialized = true;
			this.ySpring.initialized = true;
			this.trail = [];
			return;
		}

		if (this.smoothingFactor <= 0 || (this.lastTimeMs !== null && timeMs < this.lastTimeMs)) {
			this.snapTo(targetX, targetY, timeMs);
			return;
		}

		this.trail.unshift({ x: this.x, y: this.y });
		if (this.trail.length > this.trailLength) {
			this.trail.length = this.trailLength;
		}

		const deltaMs = this.lastTimeMs === null ? 1000 / 60 : Math.max(1, timeMs - this.lastTimeMs);
		this.lastTimeMs = timeMs;

		const springConfig = getCursorSpringConfig(this.smoothingFactor);
		this.x = stepSpringValue(this.xSpring, targetX, deltaMs, springConfig);
		this.y = stepSpringValue(this.ySpring, targetY, deltaMs, springConfig);
	}

	setSmoothingFactor(smoothingFactor: number): void {
		this.smoothingFactor = smoothingFactor;
	}

	snapTo(targetX: number, targetY: number, timeMs: number): void {
		this.x = targetX;
		this.y = targetY;
		this.initialized = true;
		this.lastTimeMs = timeMs;
		this.xSpring.value = targetX;
		this.ySpring.value = targetY;
		this.xSpring.velocity = 0;
		this.ySpring.velocity = 0;
		this.xSpring.initialized = true;
		this.ySpring.initialized = true;
		this.trail = [];
	}

	reset(): void {
		this.initialized = false;
		this.lastTimeMs = null;
		this.trail = [];
		resetSpringState(this.xSpring, this.x);
		resetSpringState(this.ySpring, this.y);
	}
}





export function drawCursorOnCanvas(
	ctx: CanvasRenderingContext2D,
	samples: CursorTelemetryPoint[],
	timeMs: number,
	viewport: CursorViewportRect,
	smoothedState: SmoothedCursorState,
	config: CursorRenderConfig = DEFAULT_CURSOR_CONFIG,
): void {
	if (samples.length === 0 || viewport.width <= 0 || viewport.height <= 0) return;

	const target = interpolateCursorPosition(samples, timeMs);
	if (!target) return;

	const projectedTarget = projectCursorPositionToViewport(target, viewport.sourceCrop);
	if (!projectedTarget.visible) return;

	smoothedState.update(projectedTarget.cx, projectedTarget.cy, timeMs);

	const px = viewport.x + smoothedState.x * viewport.width;
	const py = viewport.y + smoothedState.y * viewport.height;
	const h = config.dotRadius * getCursorViewportScale(viewport);
	const { cursorType, clickBounceProgress } = getCursorVisualState(
		samples,
		timeMs,
		config.clickBounceDuration,
	);
	const spriteKey = (
		cursorType && loadedCursorAssets[cursorType] ? cursorType : "arrow"
	) as CursorAssetKey;
	const asset = isStatefulCursorStyle(config.style)
		? getStatefulCursorAsset(config.style, spriteKey)
		: isSingleCursorStyle(config.style)
			? getCursorStyleAsset(config.style)
			: getCursorPackStyleAsset(config.style, spriteKey);
	const bounceScale = Math.max(
		0.72,
		1 - Math.sin(clickBounceProgress * Math.PI) * (0.08 * config.clickBounce),
	);

	ctx.save();
	if (config.style !== "figma") {
		ctx.filter = CURSOR_SVG_DROP_SHADOW_FILTER;
	}

	const drawHeight = h * bounceScale;
	const drawWidth = drawHeight * asset.aspectRatio;
	const hotspotX = asset.anchorX * drawWidth;
	const hotspotY = asset.anchorY * drawHeight;
	ctx.globalAlpha = config.dotAlpha;
	ctx.drawImage(asset.image, px - hotspotX, py - hotspotY, drawWidth, drawHeight);

	ctx.restore();
}
