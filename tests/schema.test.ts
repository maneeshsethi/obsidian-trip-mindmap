import { describe, expect, test } from 'vitest';
import { parseMap, serializeMap, newMap, newNode, convertKind, fromArtifact, COLOR_KEYS, type MapDoc } from '../src/model/schema';

function tripDoc(): MapDoc {
  const d = newMap('trip', 'Trip');
  const a = newNode('Thailand', d.rootId, { start: '2030-11-01', end: '2030-11-27', maybe: true, place: 'Bangkok', notes: 'hi', off: { x: 3, y: -4 }, side: 'R', color: 'teal' });
  const b = newNode('Vietnam', a.id, { start: '2030-11-27', fixed: true, next: true });
  d.nodes[a.id] = a; d.nodes[b.id] = b;
  d.nodes[d.rootId].children.push(a.id); a.children.push(b.id);
  return d;
}

describe('parseMap', () => {
  test('empty text becomes a new general map titled by the fallback', () => {
    const r = parseMap('', 'Ideas');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.doc.kind).toBe('general'); expect(r.doc.nodes[r.doc.rootId].text).toBe('Ideas'); }
  });
  test('whitespace-only text is treated as empty', () => { expect(parseMap('  \n', 'x').ok).toBe(true); });
  test('broken JSON fails', () => { expect(parseMap('{"nodes":', 'x').ok).toBe(false); });
  test('missing child id fails and names it', () => {
    const d = newMap('general', 'x'); d.nodes[d.rootId].children.push('nX');
    const r = parseMap(JSON.stringify(d), 'x');
    expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toContain('nX');
  });
  test('missing rootId node fails', () => {
    const d = newMap('general', 'x'); (d as any).rootId = 'nope';
    expect(parseMap(JSON.stringify(d), 'x').ok).toBe(false);
  });
  test('parent cycle fails', () => {
    const d = newMap('general', 'x');
    const a = newNode('a', 'b'), b = newNode('b', 'a'); a.id = 'a'; b.id = 'b'; a.parent = 'b'; b.parent = 'a';
    a.children = ['b']; b.children = ['a']; d.nodes.a = a; d.nodes.b = b;
    expect(parseMap(JSON.stringify(d), 'x').ok).toBe(false);
  });
  test('missing kind with a dated node infers trip', () => {
    const d: any = tripDoc(); delete d.kind;
    const r = parseMap(JSON.stringify(d), 'x'); expect(r.ok && r.doc.kind).toBe('trip');
  });
  test('missing kind without dates infers general', () => {
    const d: any = newMap('general', 'x'); delete d.kind;
    const r = parseMap(JSON.stringify(d), 'x'); expect(r.ok && r.doc.kind).toBe('general');
  });
  test('unknown color value is dropped, not fatal', () => {
    const d: any = tripDoc(); d.nodes[d.rootId].color = 'chartreuse';
    const r = parseMap(JSON.stringify(d), 'x'); expect(r.ok).toBe(true);
    if (r.ok) expect('color' in r.doc.nodes[r.doc.rootId]).toBe(false);
  });
});

describe('serializeMap', () => {
  test('round-trips every trip field', () => {
    const d = tripDoc();
    const r = parseMap(serializeMap(d), 'x');
    expect(r.ok && r.doc).toEqual(d);
  });
  test('drops artifact-only keys', () => {
    const s = serializeMap({ ...tripDoc(), example: true, rev: 5, unsaved: true, id: 'm1' } as any);
    expect(s).not.toContain('"example"'); expect(s).not.toContain('"rev"'); expect(s).not.toContain('"unsaved"');
    expect(JSON.parse(s).id).toBeUndefined();
  });
  test('is pretty-printed with trailing newline', () => {
    const s = serializeMap(newMap('general', 'x'));
    expect(s.endsWith('\n')).toBe(true); expect(s).toContain('\n  "version": 1');
  });
});

describe('kinds', () => {
  test('convert general→trip→general keeps all trip fields', () => {
    const t = tripDoc();
    expect(convertKind(convertKind(t, 'general'), 'trip')).toEqual(t);
    expect(convertKind(t, 'general').kind).toBe('general');
  });
  test('convertKind does not mutate its input', () => {
    const t = tripDoc(); convertKind(t, 'general'); expect(t.kind).toBe('trip');
  });
});

describe('fromArtifact', () => {
  test('maps artifact db doc to a trip MapDoc', () => {
    const raw = { id: 'm1', title: '2027', rootId: 'n1', nodes: { n1: { id: 'n1', text: '2027', parent: null, children: [], start: null, end: null, maybe: false, fixed: false, collapsed: false, side: null } }, rev: 13, example: false, cal: true, mode: 'b', layout: 'right', snap: true, createdAt: 1, updatedAt: 2 };
    const d = fromArtifact(raw);
    expect(d.kind).toBe('trip'); expect(d.version).toBe(1); expect(d.title).toBe('2027'); expect(d.cal).toBe(true);
    expect((d as any).rev).toBeUndefined(); expect((d as any).id).toBeUndefined(); expect((d as any).example).toBeUndefined();
  });
});

test('palette has 8 keys in order', () => {
  expect(COLOR_KEYS).toEqual(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']);
});

describe('structural validation (review fix)', () => {
  test('a child listed under a node that is not its parent is rejected', () => {
    const d = newMap('general', 'x'); const a = newNode('A', d.rootId), b = newNode('B', a.id);
    d.nodes[a.id] = a; d.nodes[b.id] = b; d.nodes[d.rootId].children.push(a.id); a.children.push(b.id);
    b.children.push(a.id); // cycle through children only
    expect(parseMap(JSON.stringify(d), 'x').ok).toBe(false);
  });
  test('a node listed twice is rejected', () => {
    const d = newMap('general', 'x'); const a = newNode('A', d.rootId);
    d.nodes[a.id] = a; d.nodes[d.rootId].children.push(a.id, a.id);
    expect(parseMap(JSON.stringify(d), 'x').ok).toBe(false);
  });
  test('a node missing from its parent list is rejected', () => {
    const d = newMap('general', 'x'); const a = newNode('A', d.rootId); d.nodes[a.id] = a;
    expect(parseMap(JSON.stringify(d), 'x').ok).toBe(false);
  });
});
