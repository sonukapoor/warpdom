# warpdom brand assets

| File | Use |
| --- | --- |
| `warpdom-lockup-dark.svg` / `.png` | Logo with name, for dark backgrounds |
| `warpdom-lockup-light.svg` / `.png` | Logo with name, for light backgrounds |
| `warpdom-icon.svg` / `.png`, `warpdom-icon-light.*` | Mark alone (with speed lines) |
| `favicon.svg` | Browser icon; switches the check colour with the browser's light/dark preference |
| `favicon.ico`, `favicon-{16,32,48,192,512}.png`, `apple-touch-icon.png` | Raster icons |
| `social-preview.png` | GitHub social preview (Settings, Social preview), 1280x640 |

Colours: blue `#2563EB` (box, speed lines), cyan `#22D3EE` (check on dark),
`#0891B2` (check on light), text `#E8E9ED` on dark and `#0F172A` on light.

The name is set in Saira (Bold Italic 800 for "warp", Light Italic 300 for
"dom", width 112), converted to outlines, so the files need no font. Saira
is licensed under the SIL Open Font License 1.1 (`source/Saira-OFL.txt`).

`source/build.py` regenerates the SVGs (Python with fontTools; it expects
`Saira-Italic.ttf`, the variable font from github.com/google/fonts,
`ofl/saira`). PNGs were rendered from the SVGs with headless Chrome.
