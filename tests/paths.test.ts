import { expect, test } from 'vitest';
import { uniquePath } from '../src/paths';

test('free name is used as-is', () => { expect(uniquePath(() => false, 'Maps', 'Untitled mindmap')).toBe('Maps/Untitled mindmap.mindmap'); });
test('taken names get a number', () => {
  const taken = new Set(['Maps/Untitled mindmap.mindmap', 'Maps/Untitled mindmap 2.mindmap']);
  expect(uniquePath(p => taken.has(p), 'Maps', 'Untitled mindmap')).toBe('Maps/Untitled mindmap 3.mindmap');
});
test('vault root has no leading slash', () => {
  expect(uniquePath(() => false, '', 'Untitled trip')).toBe('Untitled trip.mindmap');
  expect(uniquePath(() => false, '/', 'Untitled trip')).toBe('Untitled trip.mindmap');
});
