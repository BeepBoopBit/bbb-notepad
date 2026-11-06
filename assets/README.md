# App icons

The public assets needed to maintain the app are:

| File | Purpose |
| --- | --- |
| `bbb-notepad-1024.png` | Clean high-resolution master for icon generation |
| `bbb-notepad.png` | 512 px icon used by the project README |
| `../src-tauri/icons/` | Desktop PNG sizes, Windows ICO, and macOS ICNS used by builds |
| `../public/favicon.png` | Browser preview icon |

Regenerate from the project root with `npm run icons:generate`. The [generator](../scripts/generate-icons.mjs) uses filtered resizing from the high-resolution master to preserve smooth edges at small sizes. It updates the desktop icons, README image, and favicon without changing the artwork.

The original composition, colors, cat, notepad, and proportions must remain intact. Keep source experiments and editing history outside the public asset set; they are not needed to build or regenerate the icons.
