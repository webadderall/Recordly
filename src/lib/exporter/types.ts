export interface ExportConfig {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  codec?: string;
  encodingMode?: ExportEncodingMode;
  backendPreference?: ExportBackendPreference;
  experimentalNativeExport?: boolean;
  maxEncodeQueue?: number;
  maxDecodeQueue?: number;
  maxPendingFrames?: number;
  maxInFlightNativeWrites?: number;
}

export type ExportRenderBackend = 'webgpu' | 'webgl';
export type ExportEncodeBackend = 'ffmpeg' | 'webcodecs';
export type ExportBackendPreference = 'auto' | 'webcodecs' | 'breeze';
export type ExportPipelineModel = 'modern' | 'legacy';

export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number; // in seconds
  renderFps?: number;
  renderBackend?: ExportRenderBackend;
  encodeBackend?: ExportEncodeBackend;
  encoderName?: string;
  phase?: 'extracting' | 'finalizing' | 'saving'; // Phase of export
  renderProgress?: number; // 0-100, progress of GIF rendering phase
}

export interface ExportMetrics {
  totalElapsedMs: number;
  metadataLoadMs?: number;
  rendererInitMs?: number;
  nativeSessionStartMs?: number;
  decodeLoopMs?: number;
  frameCallbackMs?: number;
  renderFrameMs?: number;
  encodeWaitMs?: number;
  encodeWaitEvents?: number;
  peakEncodeQueueSize?: number;
  peakNativeWriteInFlight?: number;
  nativeCaptureMs?: number;
  nativeWriteMs?: number;
  finalizationMs?: number;
  frameCount?: number;
  renderBackend?: ExportRenderBackend;
  encodeBackend?: ExportEncodeBackend;
  encoderName?: string;
  backpressureProfile?: string;
  averageFrameCallbackMs?: number;
  averageRenderFrameMs?: number;
  averageEncodeWaitMs?: number;
  averageNativeCaptureMs?: number;
  averageNativeWriteMs?: number;
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  filePath?: string;
  error?: string;
  metrics?: ExportMetrics;
}

export interface VideoFrameData {
  frame: VideoFrame;
  timestamp: number; // in microseconds
  duration: number; // in microseconds
}

export type ExportEncodingMode = 'fast' | 'balanced' | 'quality';

export type ExportQuality = 'medium' | 'good' | 'high' | 'source';

export type ExportMp4FrameRate = 24 | 30 | 60;

// GIF Export Types
export type ExportFormat = 'mp4' | 'gif';

export type GifFrameRate = 15 | 20 | 25 | 30;

export type GifSizePreset = 'medium' | 'large' | 'original';

export interface GifExportConfig {
  frameRate: GifFrameRate;
  loop: boolean;
  sizePreset: GifSizePreset;
  width: number;
  height: number;
  zoomSmoothness?: number;
}

export interface ExportSettings {
  format: ExportFormat;
  // MP4 settings
  quality?: ExportQuality;
  encodingMode?: ExportEncodingMode;
  mp4FrameRate?: ExportMp4FrameRate;
  backendPreference?: ExportBackendPreference;
  pipelineModel?: ExportPipelineModel;
  // GIF settings
  gifConfig?: GifExportConfig;
}

export const MP4_FRAME_RATES: readonly ExportMp4FrameRate[] = [24, 30, 60] as const;

export function isValidMp4FrameRate(rate: number): rate is ExportMp4FrameRate {
  return MP4_FRAME_RATES.includes(rate as ExportMp4FrameRate);
}

export const GIF_SIZE_PRESETS: Record<GifSizePreset, { maxHeight: number; label: string }> = {
  medium: { maxHeight: 720, label: 'Medium (720p)' },
  large: { maxHeight: 1080, label: 'Large (1080p)' },
  original: { maxHeight: Infinity, label: 'Original' },
};

export const GIF_FRAME_RATES: { value: GifFrameRate; label: string }[] = [
  { value: 15, label: '15 FPS - Balanced' },
  { value: 20, label: '20 FPS - Smooth' },
  { value: 25, label: '25 FPS - Very smooth' },
  { value: 30, label: '30 FPS - Maximum' },
];

// Valid frame rates for validation
export const VALID_GIF_FRAME_RATES: readonly GifFrameRate[] = [15, 20, 25, 30] as const;

export function isValidGifFrameRate(rate: number): rate is GifFrameRate {
  return VALID_GIF_FRAME_RATES.includes(rate as GifFrameRate);
}

