# Manual test — Trip Mindmap plugin

Reload Obsidian first (or Settings → Community plugins → toggle **Trip Mindmap** off and on).

## General map
- [ ] Command palette → **New mindmap** opens `Untitled mindmap.mindmap` in a new tab.
- [ ] Right-click a folder → **New mindmap** / **New trip mindmap** both appear and work.
- [ ] Tab (child), Shift+Enter (sibling), Enter/F2 (rename), Shift+Delete, arrows, Alt+↑/↓, Space, Esc all work.
- [ ] Ctrl+E opens notes for the idea — and does **not** flip Obsidian into reading mode.
- [ ] Ctrl+Z / Ctrl+Shift+Z undo/redo map edits (not Obsidian's).
- [ ] No calendar toggle, route button, date fields, Maybe/Fixed, or next-stop actions anywhere.
- [ ] Colour: select a branch, press **C** then **5** → branch and its sub-ideas turn teal; **C 0** resets. Check in light and dark theme.
- [ ] Rename the file from the header box → file renames in the explorer.
- [ ] Close and reopen the tab → everything is still there.

## Trip map (any trip map)
- [ ] Opens with dates, calendar (Ctrl+K, then 1/2/3), Maybe (M), Fixed (F), next stop (Ctrl+Enter, N).
- [ ] Route map (R) draws, Replay and Full screen work, offline too.
- [ ] Command **Convert between trip map and general map** → trip UI disappears; convert back → dates are all still there.
- [ ] Command **Copy as outline** → paste in a note gives an indented list with dates.

## Embeds
- [ ] In a note: `![[My trip.mindmap|500]]` shows a 500px read-only map in reading view **and** live preview.
- [ ] Pan/zoom works in the embed; typing in the note is unaffected; double-click or **Open** opens the map.
- [ ] Edit the map in its tab → the embed updates.

## Ask AI
- [ ] Without a key, `/` then send → message points to Settings → Trip Mindmap.
- [ ] Add key (Settings → Trip Mindmap) → ask "add 3 ideas" → changes appear highlighted; **Keep** saves; **Revert** removes.
- [ ] If the model name errors, change **Model** in settings to one your key has.

## External changes
- [ ] With the map open and idle, change the file elsewhere (e.g. ask Claude Code to edit it) → map reloads.
- [ ] Rename an idea (box open) while the file changes → bar "This file changed on disk" with Reload / Keep mine.

## Phone
- [ ] Map opens; tap selects; bottom bar renames/adds/deletes; long-press opens the menu; pinch zooms; embeds render.
