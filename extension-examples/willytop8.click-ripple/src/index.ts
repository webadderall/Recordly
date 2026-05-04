import type { RecordlyExtensionAPI, CursorEffectContext } from "./recordly-types";

type Style = "ripple" | "pulse" | "burst";

export function activate(api: RecordlyExtensionAPI) {
  api.registerSettingsPanel({
    id: "click-ripple-settings",
    label: "Click Effects",
    icon: "sparkles",
    parentSection: "cursor",
    fields: [
      { id: "enabled",                label: "Enable click effects",       type: "toggle", defaultValue: true },
      {
        id: "style",
        label: "Style",
        type: "select",
        defaultValue: "ripple",
        options: [
          { label: "Ripple (concentric rings)", value: "ripple" },
          { label: "Pulse (filled fade)",       value: "pulse" },
          { label: "Burst (radial spokes)",     value: "burst" },
        ],
      },
      { id: "color",                   label: "Color",                      type: "color",  defaultValue: "#FFFFFF" },
      { id: "size",                    label: "Size",                       type: "slider", defaultValue: 1.0, min: 0.5, max: 2.5, step: 0.1 },
      { id: "durationMs",              label: "Duration (ms)",              type: "slider", defaultValue: 600, min: 200, max: 1500, step: 50 },
      { id: "thickness",               label: "Line thickness",             type: "slider", defaultValue: 2,   min: 1,   max: 8,    step: 1 },
      { id: "differentiateRightClick", label: "Distinct right-click style", type: "toggle", defaultValue: true },
    ],
  });

  api.registerCursorEffect((ctx: CursorEffectContext): boolean => {
    const enabled = (api.getSetting("enabled") as boolean) ?? true;
    if (!enabled) return false;

    const style           = (api.getSetting("style") as Style)    ?? "ripple";
    const color           = (api.getSetting("color") as string)   ?? "#FFFFFF";
    const size            = (api.getSetting("size") as number)    ?? 1.0;
    const durationMs      = (api.getSetting("durationMs") as number) ?? 600;
    const thickness       = (api.getSetting("thickness") as number)  ?? 2;
    const differentiateRC = (api.getSetting("differentiateRightClick") as boolean) ?? true;

    if (ctx.elapsedMs >= durationMs) return false;

    const progress    = ctx.elapsedMs / durationMs;
    const isRightClick = ctx.interactionType === "right-click";
    const distinct    = isRightClick && differentiateRC;

    // Inverse-transform so we draw at canvas-pixel coords, not scene-local coords.
    // The canvas context already has applyCanvasSceneTransform applied (translate+scale).
    // Guard against a degenerate scale (0 or NaN) to avoid Infinity/NaN coordinates.
    const t = ctx.sceneTransform;
    let x = ctx.cx * ctx.width;
    let y = ctx.cy * ctx.height;
    if (t != null && Number.isFinite(t.scale) && t.scale !== 0) {
      x = (x - t.x) / t.scale;
      y = (y - t.y) / t.scale;
    }

    // Scale relative to the SCENE, not the canvas.
    const sceneWidth  = ctx.videoLayout?.maskRect.width ?? ctx.width;
    const baseRadius  = sceneWidth * 0.04 * size;

    switch (style) {
      case "ripple":
        drawRipple(ctx.ctx, x, y, progress, baseRadius, color, thickness, distinct);
        break;
      case "pulse":
        drawPulse(ctx.ctx, x, y, progress, baseRadius, color, distinct);
        break;
      case "burst":
        drawBurst(ctx.ctx, x, y, progress, baseRadius, color, thickness, distinct);
        break;
    }

    return true;
  });

  api.log("Click Ripple activated");
}

export function deactivate() {
  // No-op. Recordly disposes registrations automatically.
}

// ---------------------------------------------------------------------------
// Style: Ripple
// ---------------------------------------------------------------------------

function drawRipple(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  p: number, base: number,
  color: string, thick: number,
  distinct: boolean,
) {
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  // Outer ring (delayed entrance)
  if (p > 0.15) {
    const op = (p - 0.15) / 0.85;
    drawRing(ctx, x, y, base * 1.4 * easeOut(op), color, thick, 1 - op, distinct);
  }

  // Inner ring
  drawRing(ctx, x, y, base * easeOut(p), color, thick, 1 - p, distinct);
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  r: number, color: string,
  thick: number, alpha: number,
  dashed: boolean,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  if (dashed) ctx.setLineDash([thick * 2, thick * 2]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Style: Pulse
// ---------------------------------------------------------------------------

function drawPulse(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  p: number, base: number,
  color: string,
  distinct: boolean,
) {
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
  const r = base * 0.9 * easeOut(p);
  const alpha = (1 - p) * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (distinct) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Style: Burst
// ---------------------------------------------------------------------------

function drawBurst(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  p: number, base: number,
  color: string, thick: number,
  distinct: boolean,
) {
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
  const SPOKES = 8;
  const innerR = base * 0.3 * easeOut(p);
  const outerR = base * 1.1 * easeOut(p);

  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  if (distinct) ctx.setLineDash([thick * 1.5, thick * 1.5]);

  for (let i = 0; i < SPOKES; i++) {
    const angle = (i / SPOKES) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
    ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
    ctx.stroke();
  }
  ctx.restore();
}
