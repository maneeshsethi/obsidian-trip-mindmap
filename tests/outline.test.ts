import { expect, test } from 'vitest';
import { newMap } from '../src/model/schema';
import { addChild, setDates } from '../src/model/ops';
import { toOutline } from '../src/model/outline';

function build(kind: 'trip' | 'general') {
  const d = newMap(kind, 'Spring trip'); const R = d.rootId;
  const tz = addChild(d, R, 'Japan');
  const s = addChild(d, tz, 'Temples'); setDates(d, s, '2030-03-20', '2030-03-26'); d.nodes[s].maybe = true;
  const f = addChild(d, tz, 'Leave KIX'); setDates(d, f, '2030-04-02', null); d.nodes[f].fixed = true; d.nodes[f].notes = 'XX202';
  const l = addChild(d, R, 'Hanoi'); d.nodes[l].collapsed = true; addChild(d, l, 'Work sprint');
  return d;
}

test('trip outline includes dates, flags, notes and collapsed branches', () => {
  expect(toOutline(build('trip'))).toBe(
`# Spring trip

- Japan
  - Temples (2030-03-20 → 2030-03-26) _maybe_
  - Leave KIX (2030-04-02) **booked**
    > XX202
- Hanoi
  - Work sprint
`);
});

test('general outline omits trip fields', () => {
  const out = toOutline(build('general'));
  expect(out).not.toContain('2026'); expect(out).not.toContain('_maybe_'); expect(out).not.toContain('**booked**');
  expect(out).toContain('    > XX202');
});
