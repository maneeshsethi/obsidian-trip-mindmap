import { describe, expect, test } from 'vitest';
import { newMap, newNode, parseMap, serializeMap, type MapDoc } from '../src/model/schema';
import { addChild, addSibling, addNext, toggleNext, delNode, reorder, reparent, setDates, normalize, nextOf, isDesc, subtreeIds, groupOf, effectiveStart, setColor, colorKeyOf } from '../src/model/ops';
import { toDay } from '../src/model/dates';

const valid = (d: MapDoc) => parseMap(serializeMap(d), 'x').ok;
function mk(kind: 'trip' | 'general' = 'trip') { const d = newMap(kind, 'Root'); return { d, R: d.rootId }; }
const txt = (d: MapDoc, ids: string[]) => ids.map(i => d.nodes[i].text);

describe('add', () => {
  test('addChild then addSibling keeps order under the parent', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const b = addSibling(d, a, 'B')!;
    expect(d.nodes[R].children).toEqual([a, b]); expect(d.nodes[b].parent).toBe(R); expect(valid(d)).toBe(true);
  });
  test('addSibling of root is refused', () => { const { d, R } = mk(); expect(addSibling(d, R)).toBeNull(); });
  test('addNext inserts a next stop and pushes the old one down the chain', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const c = addNext(d, a, 'C')!; const b = addNext(d, a, 'B')!;
    expect(nextOf(d, a)).toBe(b); expect(nextOf(d, b)).toBe(c); expect(d.nodes[c].parent).toBe(b); expect(valid(d)).toBe(true);
  });
  test('addNext on root is refused', () => { const { d, R } = mk(); expect(addNext(d, R)).toBeNull(); });
});

describe('next stops', () => {
  test('toggleNext marks one next child per parent', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const x = addChild(d, a, 'x'); const y = addChild(d, a, 'y');
    expect(toggleNext(d, x)).toBe(true); expect(toggleNext(d, y)).toBe(true);
    expect(d.nodes[x].next).toBe(false); expect(d.nodes[y].next).toBe(true);
  });
  test('toggleNext refuses a root child that is not already next', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); expect(toggleNext(d, a)).toBe(false);
  });
});

describe('delete', () => {
  test('root cannot be deleted', () => {
    const { d, R } = mk(); addChild(d, R, 'A'); expect(delNode(d, R)).toBeNull(); expect(Object.keys(d.nodes).length).toBe(2);
  });
  test('deleting a chain link splices its next stop up', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const b = addNext(d, a, 'B')!; const c = addNext(d, b, 'C')!;
    addChild(d, b, 'detail of B');
    delNode(d, b);
    expect(d.nodes[b]).toBeUndefined(); expect(d.nodes[c].parent).toBe(a); expect(d.nodes[c].next).toBe(true);
    expect(Object.values(d.nodes).some(n => n.text === 'detail of B')).toBe(false); expect(valid(d)).toBe(true);
  });
  test('returns the id to select next', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const b = addChild(d, R, 'B'); expect(delNode(d, a)).toBe(b);
  });
});

describe('move', () => {
  test('reparent under own descendant is refused', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const k = addChild(d, a, 'k');
    expect(reparent(d, a, k)).toBe(false); expect(valid(d)).toBe(true);
  });
  test('reparent root or onto self is refused', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); expect(reparent(d, R, a)).toBe(false); expect(reparent(d, a, a)).toBe(false);
  });
  test('reparent moves the node', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const b = addChild(d, R, 'B');
    expect(reparent(d, b, a)).toBe(true); expect(d.nodes[a].children).toEqual([b]); expect(d.nodes[b].parent).toBe(a);
  });
  test('reorder swaps with neighbour and refuses past the ends', () => {
    const { d, R } = mk('general'); const a = addChild(d, R, 'A'); const b = addChild(d, R, 'B');
    expect(reorder(d, b, -1)).toBe(true); expect(d.nodes[R].children).toEqual([b, a]); expect(reorder(d, b, -1)).toBe(false);
  });
  test('isDesc and subtreeIds', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const k = addChild(d, a, 'k');
    expect(isDesc(d, k, a)).toBe(true); expect(isDesc(d, a, k)).toBe(false); expect(subtreeIds(d, a).sort()).toEqual([a, k].sort());
  });
});

describe('dates and sorting', () => {
  test('setDates swaps a reversed range and drops end without start', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A');
    setDates(d, a, '2030-12-10', '2030-12-01'); expect([d.nodes[a].start, d.nodes[a].end]).toEqual(['2030-12-01', '2030-12-10']);
    setDates(d, a, null, '2030-12-10'); expect(d.nodes[a].end).toBeNull();
  });
  test('normalize sorts dated siblings, keeps undated slots, next stop last', () => {
    const { d, R } = mk(); const p = addChild(d, R, 'P');
    const x = addChild(d, p, 'Dec'); setDates(d, x, '2030-12-10', null);
    const n = addChild(d, p, 'next'); d.nodes[n].next = true;
    const y = addChild(d, p, 'Nov'); setDates(d, y, '2030-11-27', null);
    const u = addChild(d, p, 'undated');
    normalize(d);
    expect(txt(d, d.nodes[p].children)).toEqual(['Nov', 'Dec', 'undated', 'next']);
  });
  test('normalize uses the earliest date inside a branch', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const b = addChild(d, R, 'B');
    const k = addChild(d, b, 'k'); setDates(d, k, '2026-01-01', null); const j = addChild(d, a, 'j'); setDates(d, j, '2026-06-01', null);
    normalize(d); expect(txt(d, d.nodes[R].children)).toEqual(['B', 'A']);
    expect(effectiveStart(d, b)).toBe(toDay('2026-01-01'));
  });
  test('normalize leaves general maps alone', () => {
    const { d, R } = mk('general'); const x = addChild(d, R, 'late'); setDates(d, x, '2031-01-01', null);
    const y = addChild(d, R, 'early'); setDates(d, y, '2026-01-01', null);
    normalize(d); expect(txt(d, d.nodes[R].children)).toEqual(['late', 'early']);
  });
  test('normalize survives end before start written directly', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); d.nodes[a].start = '2030-12-10'; d.nodes[a].end = '2030-12-01';
    addChild(d, R, 'B'); expect(() => normalize(d)).not.toThrow();
  });
});

describe('groups and colours', () => {
  test('groupOf: root null, root child is own group, leaf takes parent', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const k = addChild(d, a, 'k');
    expect(groupOf(d, R)).toBeNull(); expect(groupOf(d, a)).toBe(a); expect(groupOf(d, k)).toBe(a);
  });
  test('colour is inherited and overridable', () => {
    const { d, R } = mk(); const a = addChild(d, R, 'A'); const k = addChild(d, a, 'k'); const g = addChild(d, k, 'g');
    setColor(d, a, 'teal'); expect(colorKeyOf(d, g)).toBe('teal');
    setColor(d, g, 'pink'); expect(colorKeyOf(d, g)).toBe('pink'); expect(colorKeyOf(d, k)).toBe('teal');
    setColor(d, a, null); expect(colorKeyOf(d, a)).toBeNull(); expect('color' in d.nodes[a]).toBe(false);
  });
});
