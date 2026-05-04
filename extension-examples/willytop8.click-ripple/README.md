# Recordly Click Ripple

Animated cursor click effects — ripple, pulse, or burst — rendered at every click. Visible in the editor preview and baked into the exported video.

## Install

### From the Recordly Marketplace

Search for **Click Ripple** at [marketplace.recordly.dev/extensions](https://marketplace.recordly.dev/extensions) and click **Install**.

### From a release zip

1. Download the latest zip from the [Releases](https://github.com/willytop8/recordly-click-ripple/releases/latest) page.
2. In Recordly, go to **Extensions → Open Directory**. Your file manager opens the user extensions folder.
3. Unzip the archive into that folder so that a `recordly-click-ripple/` directory appears there with `recordly-extension.json` at its root.
4. Restart Recordly.
5. Open the Extensions panel and confirm **Click Ripple** shows as **active**.

### From source

```bash
git clone https://github.com/willytop8/recordly-click-ripple
cd recordly-click-ripple
npm install
npm run build
```

Copy the folder into Recordly's extensions directory (step 2 above) and restart.

## Settings

Configure under **Settings → Cursor → Click Effects**. All settings update live.

| Setting | Default | Range |
|---|---|---|
| Enable | on | toggle |
| Style | Ripple | Ripple / Pulse / Burst |
| Color | `#FFFFFF` | color picker |
| Size | 1.0 | 0.5–2.5 |
| Duration (ms) | 600 | 200–1500 |
| Line thickness | 2 | 1–8 |
| Distinct right-click style | on | toggle |

Size scales relative to the scene area, not the canvas, so effects look consistent across different export resolutions and padding settings.

## Styles

**Ripple** — two concentric rings that expand and fade out. The default; draws attention without dominating the frame.

**Pulse** — a filled circle that scales up and fades. More visible than Ripple; good when you need clicks to read clearly in fast-paced content.

**Burst** — eight radial lines extending from the click point. The most prominent; useful in short-form demos where every click needs to land immediately.

When **Distinct right-click style** is on, right-clicks render with dashed lines so viewers can tell them apart from left-clicks at a glance.

## Building from source

```bash
npm install
npm run build      # one-off build
npm run watch      # rebuild on save
```

Output goes to `dist/index.js`. The manifest `main` field points there.

## How it works

The extension registers a cursor effect via `registerCursorEffect`. Each click triggers a per-frame callback that draws the current animation frame onto Recordly's canvas and returns `true` until the duration elapses, then `false`. The same callback runs in both the editor preview and the export pipeline — what you see is what you get.

## Permissions

- `cursor` — to register click effects.
- `ui` — to register the settings panel.

No audio, timeline, file asset, or export access.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

Issues and pull requests welcome at [github.com/willytop8/recordly-click-ripple](https://github.com/willytop8/recordly-click-ripple). The extension API is documented in [EXTENSIONS.md](https://github.com/webadderallorg/Recordly/blob/main/EXTENSIONS.md).

## Credits

Built for [Recordly](https://www.recordly.dev) by [@webadderallorg](https://github.com/webadderallorg).
