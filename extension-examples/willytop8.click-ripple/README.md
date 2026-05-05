# Recordly Click Ripple

Cursor click effects for [Recordly](https://www.recordly.dev): ripple, pulse, and burst.

## Install

1. Clone or download this repo.
2. Run `npm install && npm run build`.
3. In Recordly, go to **Extensions → Open Directory**.
4. Copy the entire `willytop8.click-ripple/` folder into that directory.
5. Restart Recordly. **Click Ripple** should appear as active in the Extensions panel.

## Settings

Open **Settings → Cursor → Click Effects**. All settings update live.

| Setting | Default | Range |
|---|---|---|
| Enable | on | toggle |
| Style | Ripple | Ripple / Pulse / Burst |
| Color | `#2563EB` | color picker |
| Size | 1.0 | 0.5–2.5 |
| Duration (ms) | 600 | 200–1500 |
| Line thickness | 2 | 1–8 |
| Distinct right-click style | on | toggle |

Size scales relative to the scene area rather than the canvas, so effects look consistent across different export resolutions and padding settings.

## Styles

**Ripple** — two concentric rings that expand and fade.

**Pulse** — a soft halo that scales up and fades out.

**Burst** — eight radial lines extending from the click point.

When **Distinct right-click style** is on, right-clicks render with dashed lines instead of solid ones.

## Building from source

```bash
npm install
npm run build      # one-off build
npm run watch      # rebuild on save
```

Output goes to `dist/index.js`.

## How it works

The extension registers one cursor effect with `registerCursorEffect()`. The callback draws each animation frame until the effect duration elapses.

## Permissions

- `cursor` — to register click effects
- `ui` — to register the settings panel

## License

MIT — see [LICENSE](./LICENSE).
