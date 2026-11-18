import { expect, test } from 'vitest';
import { History } from '../src/model/history';

test('undo then redo returns to the state', () => {
  const h = new History(); h.push('s0');
  expect(h.undo('s1')).toBe('s0'); expect(h.redo('s0')).toBe('s1');
});
test('cap keeps only the newest 200 snapshots', () => {
  const h = new History(); for (let i = 0; i < 201; i++) h.push('s' + i);
  let cur = 'now', n = 0, last = '';
  for (;;) { const s = h.undo(cur); if (s == null) break; last = s; cur = s; n++; }
  expect(n).toBe(200); expect(last).toBe('s1');
});
test('push after undo clears redo', () => {
  const h = new History(); h.push('a'); h.undo('b'); h.push('c'); expect(h.redo('x')).toBeNull();
});
test('empty history returns null', () => { const h = new History(); expect(h.undo('x')).toBeNull(); expect(h.redo('x')).toBeNull(); });
