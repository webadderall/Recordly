import { Application, Graphics, Sprite } from "pixi.js";
import { drawSquircleOnGraphics } from "@/lib/geometry/squircle";
import type { CropRegion, Padding } from "../types";

interface LayoutParams {
	container: HTMLDivElement;
	app: Application;
	videoSprite: Sprite;
	maskGraphics: Graphics;
	videoElement: HTMLVideoElement;
	cropRegion?: CropRegion;
	lockedVideoDimensions?: { width: number; height: number } | null;
	borderRadius?: number;
	padding?: Padding | number;
	/** Screen insets from the active device frame, used to scale/center the full frame */
	frameInsets?: { top: number; right: number; bottom: number; left: number } | null;
}

interface LayoutResult {
	stageSize: { width: number; height: number };
	videoSize: { width: number; height: number };
	baseScale: number;
	baseOffset: { x: number; y: number };
	maskRect: {
		x: number;
		y: number;
		width: number;
		height: number;
		sourceCrop?: CropRegion;
	};
	cropBounds: { startX: number; endX: number; startY: number; endY: number };
}

export function layoutVideoContent(params: LayoutParams): LayoutResult | null {
	const {
		container,
		app,
		videoSprite,
		maskGraphics,
		videoElement,
		cropRegion,
		lockedVideoDimensions,
		borderRadius = 0,
		padding = 0,
		frameInsets,
	} = params;

	const videoWidth = lockedVideoDimensions?.width || videoElement.videoWidth;
	const videoHeight = lockedVideoDimensions?.height || videoElement.videoHeight;

	if (!videoWidth || !videoHeight) {
		return null;
	}

	const width = container.clientWidth;
	const height = container.clientHeight;

	if (!width || !height) {
		return null;
	}

	app.renderer.resize(width, height);
	app.canvas.style.width = "100%";
	app.canvas.style.height = "100%";

	// Apply crop region
	const crop = cropRegion || { x: 0, y: 0, width: 1, height: 1 };

	// Calculate the cropped dimensions
	const croppedVideoWidth = videoWidth * crop.width;
	const croppedVideoHeight = videoHeight * crop.height;

	const cropStartX = crop.x * videoWidth;
	const cropStartY = crop.y * videoHeight;
	const cropEndX = cropStartX + croppedVideoWidth;
	const cropEndY = cropStartY + croppedVideoHeight;

	// Apply asymmetrical padding
	const p =
		typeof padding === "number"
			? { top: padding, bottom: padding, left: padding, right: padding }
			: padding;

	// Padding is a percentage (0-100), where 50 matches the original VIEWPORT_SCALE of 0.8
	// We use 0.2 as a multiplier for each side so that uniform 100% padding results in 0.6 scale (1.0 - 0.4)
	const leftPadFrac = (p.left / 100) * 0.2;
	const rightPadFrac = (p.right / 100) * 0.2;
	const topPadFrac = (p.top / 100) * 0.2;
	const bottomPadFrac = (p.bottom / 100) * 0.2;

	const availableFracW = 1.0 - leftPadFrac - rightPadFrac;
	const availableFracH = 1.0 - topPadFrac - bottomPadFrac;

	const maxDisplayWidth = width * availableFracW;
	const maxDisplayHeight = height * availableFracH;

	// When a device frame is active, the frame extends beyond the video area.
	// We need to scale so the ENTIRE frame (video + bezels) fits in the viewport,
	// then center the full frame, not just the video content.
	const insets = frameInsets;
	// Fraction of the full frame occupied by the screen area
	const screenFracW = insets ? 1 - insets.left - insets.right : 1;
	const screenFracH = insets ? 1 - insets.top - insets.bottom : 1;
	// Full frame dimensions in video pixels (the frame image is this large relative to the screen)
	const fullFrameVideoW = croppedVideoWidth / screenFracW;
	const fullFrameVideoH = croppedVideoHeight / screenFracH;

	const scale = Math.min(maxDisplayWidth / fullFrameVideoW, maxDisplayHeight / fullFrameVideoH);

	videoSprite.scale.set(scale);

	// Calculate display size of the full video at this scale
	const fullVideoDisplayWidth = videoWidth * scale;
	const fullVideoDisplayHeight = videoHeight * scale;

	// Calculate display size of just the cropped region
	const croppedDisplayWidth = croppedVideoWidth * scale;
	const croppedDisplayHeight = croppedVideoHeight * scale;

	// Center the full frame (or just the video if no frame) in the available area
	// Full frame display dimensions
	const fullFrameDisplayW = fullFrameVideoW * scale;
	const fullFrameDisplayH = fullFrameVideoH * scale;

	// Center point of the available area relative to the container
	const availableCenterX = leftPadFrac * width + maxDisplayWidth / 2;
	const availableCenterY = topPadFrac * height + maxDisplayHeight / 2;

	// The full frame's top-left, centered in the available area
	const frameCenterX = availableCenterX - fullFrameDisplayW / 2;
	const frameCenterY = availableCenterY - fullFrameDisplayH / 2;
	// The screen area starts at frameCenterX + insets.left * fullFrameDisplayW
	const centerOffsetX = insets
		? frameCenterX + insets.left * fullFrameDisplayW
		: frameCenterX;
	const centerOffsetY = insets
		? frameCenterY + insets.top * fullFrameDisplayH
		: frameCenterY;

	// Position the full video sprite so that when we apply the mask,
	// the cropped region appears centered
	// The crop starts at (crop.x * videoWidth, crop.y * videoHeight) in video coordinates
	// In display coordinates, that's (crop.x * fullVideoDisplayWidth, crop.y * fullVideoDisplayHeight)
	// We want that point to be at centerOffsetX, centerOffsetY
	const spriteX = centerOffsetX - crop.x * fullVideoDisplayWidth;
	const spriteY = centerOffsetY - crop.y * fullVideoDisplayHeight;

	videoSprite.position.set(spriteX, spriteY);

	// Create a mask that only shows the cropped region (centered in container)
	const maskX = centerOffsetX;
	const maskY = centerOffsetY;

	// Apply border radius
	maskGraphics.clear();
	drawSquircleOnGraphics(maskGraphics, {
		x: maskX,
		y: maskY,
		width: croppedDisplayWidth,
		height: croppedDisplayHeight,
		radius: borderRadius,
	});
	maskGraphics.fill({ color: 0xffffff });

	return {
		stageSize: { width, height },
		videoSize: { width: croppedVideoWidth, height: croppedVideoHeight },
		baseScale: scale,
		baseOffset: { x: spriteX, y: spriteY },
		maskRect: {
			x: maskX,
			y: maskY,
			width: croppedDisplayWidth,
			height: croppedDisplayHeight,
			sourceCrop: crop,
		},
		cropBounds: { startX: cropStartX, endX: cropEndX, startY: cropStartY, endY: cropEndY },
	};
}
