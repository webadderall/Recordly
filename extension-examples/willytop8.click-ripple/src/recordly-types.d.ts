// Recordly Extension API types, sourced from Recordly/src/lib/extensions/types.ts.

export interface ContributedCursorStyle {
	id: string;
	label: string;
	/** Path to cursor image relative to extension root */
	defaultImage: string;
	/** Optional click state image */
	clickImage?: string;
	/** Hotspot offset from top-left (normalized 0-1) */
	hotspot?: { x: number; y: number };
}

export interface ContributedSound {
	id: string;
	label: string;
	/** Sound category */
	category: "click" | "transition" | "ambient" | "notification";
	/** Path to audio file relative to extension root */
	file: string;
	/** Duration in ms (auto-detected if omitted) */
	durationMs?: number;
}

export interface ContributedWallpaper {
	id: string;
	label: string;
	/** Path to image/video file relative to extension root */
	file: string;
	/** Thumbnail for the picker */
	thumbnail?: string;
	/** Whether this is a video wallpaper */
	isVideo?: boolean;
}

export interface ContributedWebcamFrame {
	id: string;
	label: string;
	/** Path to frame overlay image (PNG with transparency) */
	file: string;
	thumbnail?: string;
}

export interface ContributedFrame {
	id: string;
	label: string;
	/** Category for grouping in the picker */
	category: "browser" | "laptop" | "phone" | "tablet" | "desktop" | "custom";
	/** Path to frame overlay image (PNG or SVG with transparency) relative to extension root */
	file?: string;
	/** Alternative: a data URL (e.g. from Canvas.toDataURL) for runtime-generated frames */
	dataUrl?: string;
	/** Thumbnail for the picker */
	thumbnail?: string;
	/**
	 * Insets defining where the screen content sits inside the frame image,
	 * as fractions (0-1) of the frame image dimensions.
	 * { top, right, bottom, left }
	 */
	screenInsets: { top: number; right: number; bottom: number; left: number };
	/** Whether the frame has a dark or light appearance (for wallpaper matching) */
	appearance?: "light" | "dark";
	/**
	 * Resolution-independent draw function. Called at the target dimensions
	 * to draw the frame chrome, leaving the screen area transparent.
	 * Preferred over file/dataUrl — avoids bitmap scaling artifacts.
	 */
	draw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/** Context passed to render hooks each frame */
export interface RenderHookContext {
	/** Output canvas width */
	width: number;
	/** Output canvas height */
	height: number;
	/** Current playback time in ms */
	timeMs: number;
	/** Total video duration in ms */
	durationMs: number;
	/** Current cursor position (normalized 0-1, null if no cursor) */
	cursor: { cx: number; cy: number; interactionType?: string } | null;
	/** Current smoothed cursor state and trailing path (normalized 0-1) */
	smoothedCursor?: {
		cx: number;
		cy: number;
		trail: Array<{ cx: number; cy: number }>;
	} | null;
	/** The 2D rendering context to draw on */
	ctx: CanvasRenderingContext2D;
	/** Current video content layout (position & size inside the canvas) */
	videoLayout?: {
		/** Position & size of the masked video content area (in canvas pixels) */
		maskRect: { x: number; y: number; width: number; height: number };
		/** Border radius applied to the video (in canvas pixels) */
		borderRadius: number;
		/** Padding around the video (in canvas pixels). Can be a number (global) or an object with individual sides. */
		padding: number | { top: number; right: number; bottom: number; left: number };
	};
	/** Current zoom state */
	zoom?: {
		/** 1 = no zoom, >1 = zoomed in */
		scale: number;
		/** Normalized focus point (0-1) */
		focusX: number;
		focusY: number;
		/** 0 = idle, 1 = fully zoomed in */
		progress: number;
	};
	/** Current scene transform (motion animation offset & scale). */
	sceneTransform?: {
		scale: number;
		x: number;
		y: number;
	};
	/** Current shadow settings */
	shadow?: {
		enabled: boolean;
		intensity: number;
	};

	getPixelColor(x: number, y: number): { r: number; g: number; b: number; a: number };
	getAverageSceneColor(): { r: number; g: number; b: number; a: number };
	getEdgeAverageColor(edgeWidth?: number): { r: number; g: number; b: number; a: number };
	getDominantColors(
		count?: number,
	): Array<{ r: number; g: number; b: number; frequency: number }>;
}

/** Render hook phases — extensions draw in the registered phase */
export type RenderHookPhase =
	| "background"
	| "post-video"
	| "post-zoom"
	| "post-cursor"
	| "post-webcam"
	| "post-annotations"
	| "final";

export type RenderHookFn = (ctx: RenderHookContext) => void;

export interface CursorEffectContext {
	/** Current time in ms */
	timeMs: number;
	/** Cursor position (normalized 0-1) */
	cx: number;
	cy: number;
	/** Interaction type that triggered this effect */
	interactionType: "click" | "double-click" | "right-click" | "mouseup";
	/** Canvas dimensions */
	width: number;
	height: number;
	/** 2D context to draw the effect */
	ctx: CanvasRenderingContext2D;
	/** Milliseconds since the interaction occurred */
	elapsedMs: number;
	/** Current zoom state (same as RenderHookContext.zoom) */
	zoom?: {
		scale: number;
		focusX: number;
		focusY: number;
		progress: number;
	};
	/** Current scene transform applied to the canvas */
	sceneTransform?: {
		scale: number;
		x: number;
		y: number;
	};
	/** Video content layout inside the canvas */
	videoLayout?: {
		maskRect: { x: number; y: number; width: number; height: number };
		borderRadius: number;
		padding: number | { top: number; right: number; bottom: number; left: number };
	};
}

export type CursorEffectFn = (ctx: CursorEffectContext) => boolean; // return false to stop animation

export type ExtensionEventType =
	| "playback:timeupdate"
	| "playback:play"
	| "playback:pause"
	| "cursor:click"
	| "cursor:move"
	| "timeline:region-added"
	| "timeline:region-removed"
	| "export:start"
	| "export:frame"
	| "export:complete";

export interface ExtensionEvent {
	type: ExtensionEventType;
	timeMs?: number;
	data?: unknown;
}

export type ExtensionEventHandler = (event: ExtensionEvent) => void;

export interface ExtensionSettingField {
	id: string;
	label: string;
	type: "toggle" | "slider" | "select" | "color" | "text";
	defaultValue: unknown;
	/** For sliders */
	min?: number;
	max?: number;
	step?: number;
	/** For select */
	options?: { label: string; value: string }[];
}

export interface ExtensionSettingsPanel {
	/** Unique panel ID */
	id: string;
	/** Display label in settings */
	label: string;
	/** Icon name (lucide icon) */
	icon?: string;
	/** If set, renders inside this existing section (e.g. 'cursor', 'scene').
	 *  Otherwise, creates a new standalone section. */
	parentSection?: string;
	/** Setting fields */
	fields: ExtensionSettingField[];
}

export interface RecordlyExtensionAPI {
	/** Register a render hook at a specific pipeline phase */
	registerRenderHook(phase: RenderHookPhase, hook: RenderHookFn): () => void;

	/** Register a cursor click effect */
	registerCursorEffect(effect: CursorEffectFn): () => void;

	/** Register a device frame (browser chrome, laptop bezel, etc.) */
	registerFrame(frame: ContributedFrame): () => void;

	/** Register a wallpaper/background image or video */
	registerWallpaper(wallpaper: ContributedWallpaper): () => void;

	/** Register a cursor style pack */
	registerCursorStyle(cursorStyle: ContributedCursorStyle): () => void;

	/** Listen to extension events */
	on(event: ExtensionEventType, handler: ExtensionEventHandler): () => void;

	/** Register a settings panel for this extension */
	registerSettingsPanel(panel: ExtensionSettingsPanel): () => void;

	/** Get the current value of an extension setting */
	getSetting(settingId: string): unknown;

	/** Set an extension setting value */
	setSetting(settingId: string, value: unknown): void;

	/** Resolve an asset path relative to the extension root */
	resolveAsset(relativePath: string): string;

	/**
	 * Play a sound from a bundled audio file (relative to extension root).
	 * Returns a stop function to cancel playback early.
	 * Optional volume (0-1, default 1).
	 */
	playSound(relativePath: string, options?: { volume?: number }): () => void;

	/** Log a message (visible in dev tools, prefixed with extension ID) */
	log(message: string, ...args: unknown[]): void;

	/** Get video info (resolution, duration, fps) */
	getVideoInfo(): {
		width: number;
		height: number;
		durationMs: number;
		fps: number;
	} | null;

	/** Get the current video content layout (mask rect, padding, etc.) */
	getVideoLayout(): {
		maskRect: { x: number; y: number; width: number; height: number };
		canvasWidth: number;
		canvasHeight: number;
		borderRadius: number;
		padding: number | { top: number; right: number; bottom: number; left: number };
	} | null;

	getCursorAt(timeMs: number): {
		cx: number;
		cy: number;
		timeMs: number;
		interactionType?: string;
		pressure?: number;
	} | null;

	getSmoothedCursor(): {
		cx: number;
		cy: number;
		timeMs: number;
		trail: Array<{ cx: number; cy: number }>;
	} | null;

	getZoomState(): {
		scale: number;
		focusX: number;
		focusY: number;
		progress: number;
	} | null;

	getShadowConfig(): {
		enabled: boolean;
		intensity: number;
	};

	getKeystrokesInRange(
		startMs: number,
		endMs: number,
	): Array<{
		timeMs: number;
		key: string;
		modifiers: string[];
	}>;

	getAspectRatio(): number | null;
	getActiveFrame(): string | null;
	isExtensionActive(extensionId: string): boolean;

	getPlaybackState(): {
		currentTimeMs: number;
		durationMs: number;
		isPlaying: boolean;
	} | null;

	getCanvasDimensions(): { width: number; height: number } | null;

	onSettingChange(callback: (settingId: string, value: unknown) => void): () => void;
	getAllSettings(): Record<string, unknown>;
}

export interface FrameInstance {
	/** Unique id: extensionId + '/' + frame.id */
	id: string;
	/** Extension that contributed this frame */
	extensionId: string;
	label: string;
	category: ContributedFrame["category"];
	/** Resolved absolute file:// URL to the frame overlay (PNG, SVG, or data URL) */
	filePath: string;
	/** Resolved absolute file:// URL to the thumbnail (or filePath if absent) */
	thumbnailPath: string;
	/** Screen insets (fraction 0-1 of frame image) */
	screenInsets: { top: number; right: number; bottom: number; left: number };
	appearance?: "light" | "dark";
	/** Resolution-independent draw function (if provided by the extension) */
	draw?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}
