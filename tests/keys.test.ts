import { expect, test } from 'vitest';
import { shouldClaimHotkey } from '../src/keys';

test('claims Obsidian hotkeys only when focus is on the map, not in a text field', () => {
  const root = document.createElement('div'); const pane = document.createElement('section'); pane.tabIndex = 0;
  const notes = document.createElement('textarea'); const date = document.createElement('input');
  root.append(pane, notes, date); document.body.append(root);
  expect(shouldClaimHotkey(pane, root)).toBe(true);
  expect(shouldClaimHotkey(notes, root)).toBe(false);
  expect(shouldClaimHotkey(date, root)).toBe(false);
  expect(shouldClaimHotkey(document.body, root)).toBe(false);
  expect(shouldClaimHotkey(pane, null)).toBe(false);
});
