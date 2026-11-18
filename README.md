# Trip Mindmap for Obsidian

Keyboard-driven mind maps for Obsidian, for any topic, plus **trip maps** with dates, a calendar and an animated route map.

- Each map is a standalone `.mindmap` file. Embed it in any note with `![[My map.mindmap]]` (or `![[My map.mindmap|500]]` for a 500px-tall embed).
- **New mindmap** and **New trip mindmap** appear in the command palette and in a folder's right-click menu.
- Colour any idea and its sub-ideas: press `C`, then `1`–`8` (`0` resets).
- Optional **Ask AI** panel using your own OpenAI API key (Settings → Trip Mindmap).
- Works on mobile for viewing and light edits.

## Install with BRAT

1. Install **BRAT** from Community plugins.
2. Run **BRAT: Add a beta plugin** and enter `maneeshsethi/obsidian-trip-mindmap`.
3. Enable **Trip Mindmap** in Community plugins.

## Keys

| Key | Action |
|---|---|
| Tab | Add sub-idea |
| Shift+Enter | Add sibling |
| Enter / F2 | Rename |
| Shift+Delete | Delete |
| Arrows | Move selection |
| Alt+↑ / Alt+↓ | Reorder |
| Space | Collapse / expand |
| Ctrl+E | Notes |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| C then 1–8 | Colour |
| / | Ask AI |

**Trip maps** add:

| Key | Action |
|---|---|
| Ctrl+D | Dates |
| M | Maybe |
| F | Fixed / booked |
| Ctrl+Enter / N | Next stop |
| Ctrl+K | Calendar |
| R | Route map |

Press `?` in a map for the full list.

## Development

```bash
npm install
npm test
npm run build                         # → main.js
scripts/install.sh /path/to/vault     # copy into <vault>/.obsidian/plugins/trip-mindmap/
```

The editor (`src/editor/editor.js`, `markup.ts`, `styles.css`) is generated from `reference/trip-mindmap.html` by `python3 scripts/port-editor.py`.

Your OpenAI key is stored in `<vault>/.obsidian/plugins/trip-mindmap/data.json`. Keep that file out of git and out of anything you share.
