import { expect, test } from 'vitest';
import { SyncState } from '../src/sync';

test('edits save normally when there is no conflict', () => {
  const s = new SyncState(); s.loaded('A'); expect(s.edited()).toBe(true);
});
test('external change during unsaved edit opens a conflict and blocks saving', () => {
  const s = new SyncState(); s.loaded('A'); s.edited();
  expect(s.onDisk('B', false)).toBe('prompt');
  expect(s.edited()).toBe(false);                     // further edits must not trigger a save
  expect(s.viewData(() => 'MINE')).toBe('B');          // a queued save writes the disk text back, not ours
});
test('Keep mine resolves the conflict and saves our version', () => {
  const s = new SyncState(); s.loaded('A'); s.edited(); s.onDisk('B', false);
  s.keepMine(); expect(s.viewData(() => 'MINE')).toBe('MINE'); expect(s.edited()).toBe(true);
});
test('Reload resolves the conflict with the disk text', () => {
  const s = new SyncState(); s.loaded('A'); s.edited(); s.onDisk('B', false);
  s.loaded('B'); expect(s.viewData(() => 'B2')).toBe('B2'); expect(s.onDisk('B2', false)).toBe('ignore');
});
test('a second external change during a conflict updates the disk text', () => {
  const s = new SyncState(); s.loaded('A'); s.edited(); s.onDisk('B', false);
  expect(s.onDisk('C', false)).toBe('prompt'); expect(s.viewData(() => 'MINE')).toBe('C');
});
test('our own save echoing back is ignored; idle change reloads', () => {
  const s = new SyncState(); s.loaded('A'); s.edited(); s.viewData(() => 'A2');
  expect(s.onDisk('A2', false)).toBe('ignore'); expect(s.onDisk('Z', false)).toBe('reload');
});
