// src/index.ts
var easeOut2 = (t) => 1 - Math.pow(1 - t, 2);
var easeOut3 = (t) => 1 - Math.pow(1 - t, 3);
function activate(api) {
  api.registerSettingsPanel({
    id: "click-ripple-settings",
    label: "Click Effects",
    icon: "sparkles",
    parentSection: "cursor",
    fields: [
      { id: "enabled", label: "Enable click effects", type: "toggle", defaultValue: true },
      {
        id: "style",
        label: "Style",
        type: "select",
        defaultValue: "ripple",
        options: [
          { label: "Ripple (concentric rings)", value: "ripple" },
          { label: "Pulse (soft halo)", value: "pulse" },
          { label: "Burst (radial spokes)", value: "burst" }
        ]
      },
      { id: "color", label: "Color", type: "color", defaultValue: "#2563EB" },
      { id: "size", label: "Size", type: "slider", defaultValue: 1, min: 0.5, max: 2.5, step: 0.1 },
      { id: "durationMs", label: "Duration (ms)", type: "slider", defaultValue: 600, min: 200, max: 1500, step: 50 },
      { id: "thickness", label: "Line thickness", type: "slider", defaultValue: 2, min: 1, max: 8, step: 1 },
      { id: "differentiateRightClick", label: "Distinct right-click style", type: "toggle", defaultValue: true }
    ]
  });
  api.registerCursorEffect((ctx) => {
    if (!api.getSetting("enabled")) return false;
    const style = api.getSetting("style");
    const color = api.getSetting("color");
    const size = api.getSetting("size");
    const durationMs = api.getSetting("durationMs");
    const thickness = api.getSetting("thickness");
    const differentiateRC = api.getSetting("differentiateRightClick");
    if (ctx.elapsedMs >= durationMs) return false;
    const progress = ctx.elapsedMs / durationMs;
    const distinct = ctx.interactionType === "right-click" && differentiateRC;
    const t = ctx.sceneTransform;
    let x = ctx.cx * ctx.width;
    let y = ctx.cy * ctx.height;
    if (t != null && t.scale !== 0) {
      x = (x - t.x) / t.scale;
      y = (y - t.y) / t.scale;
    }
    const sceneWidth = ctx.videoLayout?.maskRect.width ?? ctx.width;
    const baseRadius = sceneWidth * 0.04 * size;
    switch (style) {
      case "ripple":
        drawRipple(ctx.ctx, x, y, progress, baseRadius, color, thickness, distinct);
        break;
      case "pulse":
        drawPulse(ctx.ctx, x, y, progress, baseRadius, color, thickness, distinct);
        break;
      case "burst":
        drawBurst(ctx.ctx, x, y, progress, baseRadius, color, thickness, distinct);
        break;
    }
    return true;
  });
}
function deactivate() {
}
function drawRipple(ctx, x, y, p, base, color, thick, distinct) {
  if (p > 0.15) {
    const op = (p - 0.15) / 0.85;
    drawRing(ctx, x, y, base * 1.4 * easeOut3(op), color, thick, 1 - op, distinct);
  }
  drawRing(ctx, x, y, base * easeOut3(p), color, thick, 1 - p, distinct);
}
function drawRing(ctx, x, y, r, color, thick, alpha, dashed) {
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
function drawPulse(ctx, x, y, p, base, color, thick, distinct) {
  const r = base * 0.9 * easeOut2(p);
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.65;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  if (distinct) {
    ctx.setLineDash([thick * 2, thick * 2]);
  }
  ctx.stroke();
  ctx.restore();
}
function drawBurst(ctx, x, y, p, base, color, thick, distinct) {
  const innerR = base * 0.3 * easeOut2(p);
  const outerR = base * 1.1 * easeOut2(p);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.lineCap = "round";
  if (distinct) ctx.setLineDash([thick * 1.5, thick * 1.5]);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
    ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
    ctx.stroke();
  }
  ctx.restore();
}
export {
  activate,
  deactivate
};
