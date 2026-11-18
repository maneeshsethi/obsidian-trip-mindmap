// Pure tree operations on a MapDoc, ported from the reference artifact.
// They mutate the doc in place; the editor wraps them with undo + render.
import { newNode, type ColorKey, type MapDoc, COLOR_KEYS } from './schema';
import { toDay } from './dates';

const N = (d: MapDoc, id: string) => d.nodes[id];

export function nextOf(d: MapDoc, id: string): string | null {
  const n = N(d, id); if (!n) return null;
  for (const c of n.children) if (N(d, c)?.next) return c;
  return null;
}
/** true when a is a descendant of b */
export function isDesc(d: MapDoc, a: string, b: string): boolean {
  let n = N(d, a);
  while (n) { if (n.parent === b) return true; n = n.parent ? N(d, n.parent) : (undefined as any); }
  return false;
}
export function subtreeIds(d: MapDoc, id: string): string[] {
  const out: string[] = []; const w = (x: string) => { out.push(x); N(d, x).children.forEach(w); }; w(id); return out;
}
export function groupOf(d: MapDoc, id: string): string | null {
  if (id === d.rootId) return null;
  const n = N(d, id);
  if (n.next || n.children.length || n.parent === d.rootId) return id;
  return n.parent;
}
export function sideOf(d: MapDoc, id: string): 'L' | 'R' {
  if (d.layout !== 'both') return 'R';
  const n = N(d, id); if (n.side) return n.side;
  const i = N(d, d.rootId).children.indexOf(id);
  return i % 2 ? 'L' : 'R';
}
/** own start day, else the earliest start in the branch */
export function effectiveStart(d: MapDoc, id: string, memo: Record<string, number | null> = {}): number | null {
  if (id in memo) return memo[id];
  const n = N(d, id); let b = n.start ? toDay(n.start) : null;
  if (b == null) n.children.forEach(c => { const x = effectiveStart(d, c, memo); if (x != null && (b == null || x < b)) b = x; });
  return (memo[id] = b);
}

export function addChild(d: MapDoc, parentId: string, text = ''): string {
  const p = N(d, parentId); const n = newNode(text, parentId);
  if (parentId === d.rootId) { const L = p.children.filter(c => sideOf(d, c) === 'L').length; n.side = L < p.children.length - L ? 'L' : 'R'; }
  d.nodes[n.id] = n; p.children.push(n.id); p.collapsed = false;
  return n.id;
}
export function addSibling(d: MapDoc, id: string, text = ''): string | null {
  if (!id || id === d.rootId || !N(d, id)) return null;
  const n = N(d, id), p = N(d, n.parent!);
  const s = newNode(text, p.id, { side: n.side });
  d.nodes[s.id] = s; p.children.splice(p.children.indexOf(id) + 1, 0, s.id);
  return s.id;
}
export function addNext(d: MapDoc, id: string, text = ''): string | null {
  if (!id || id === d.rootId || !N(d, id)) return null;
  const n = N(d, id); const old = nextOf(d, id);
  const s = newNode(text, id, { next: true });
  d.nodes[s.id] = s; n.children.push(s.id); n.collapsed = false;
  if (old) { n.children.splice(n.children.indexOf(old), 1); N(d, old).parent = s.id; s.children.push(old); }
  return s.id;
}
export function toggleNext(d: MapDoc, id: string): boolean {
  if (!id || id === d.rootId) return false;
  const n = N(d, id); if (n.parent === d.rootId && !n.next) return false;
  if (n.next) n.next = false;
  else { N(d, n.parent!).children.forEach(c => { N(d, c).next = false; }); n.next = true; }
  return true;
}
export function delNode(d: MapDoc, id: string): string | null {
  if (!id || id === d.rootId || !N(d, id)) return null;
  const n = N(d, id), p = N(d, n.parent!); const i = p.children.indexOf(id);
  const nx = nextOf(d, id);
  if (nx) { n.children.splice(n.children.indexOf(nx), 1); N(d, nx).parent = p.id; N(d, nx).next = !!n.next; p.children.splice(i + 1, 0, nx); }
  const kill = (x: string) => { N(d, x).children.forEach(kill); delete d.nodes[x]; };
  kill(id); p.children.splice(i, 1);
  return p.children[i] || p.children[i - 1] || p.id;
}
export function reorder(d: MapDoc, id: string, dir: -1 | 1): boolean {
  if (!id || id === d.rootId) return false;
  const p = N(d, N(d, id).parent!), a = p.children, i = a.indexOf(id); let j = i + dir;
  if (p.id === d.rootId) { const sd = sideOf(d, id); while (j >= 0 && j < a.length && sideOf(d, a[j]) !== sd) j += dir; }
  if (j < 0 || j >= a.length) return false;
  a.splice(i, 1); a.splice(j, 0, id); return true;
}
export function reparent(d: MapDoc, id: string, newParent: string, index?: number, side?: 'L' | 'R' | null): boolean {
  if (!N(d, id) || !N(d, newParent) || id === newParent || id === d.rootId || isDesc(d, newParent, id)) return false;
  const n = N(d, id); if (n.parent === newParent && newParent !== d.rootId && index == null) return false;
  const op = N(d, n.parent!); op.children.splice(op.children.indexOf(id), 1);
  const t = N(d, newParent);
  if (index == null || index < 0 || index > t.children.length) t.children.push(id); else t.children.splice(index, 0, id);
  t.collapsed = false; n.parent = newParent; n.next = false; n.side = newParent === d.rootId ? (side ?? null) : null;
  return true;
}
export function setDates(d: MapDoc, id: string, s: string | null, e: string | null): void {
  const n = N(d, id); if (s && e && e < s) { const t = s; s = e; e = t; }
  n.start = s || null; n.end = s ? (e && e !== s ? e : null) : null;
}
export function setColor(d: MapDoc, id: string, color: ColorKey | null): void {
  const n = N(d, id); if (!n) return;
  if (color && (COLOR_KEYS as readonly string[]).includes(color)) n.color = color; else delete n.color;
}
export function colorKeyOf(d: MapDoc, id: string): ColorKey | null {
  for (let x: string | null = id; x && d.nodes[x]; x = d.nodes[x].parent) {
    const c = d.nodes[x].color; if (c && (COLOR_KEYS as readonly string[]).includes(c)) return c;
  }
  return null;
}
/** Dated siblings run in date order; undated keep their slots; the next stop is always last. Trip maps only. */
export function normalize(d: MapDoc): void {
  if (d.kind !== 'trip') return;
  const memo: Record<string, number | null> = {}; const ed = (id: string) => effectiveStart(d, id, memo);
  for (const id in d.nodes) {
    const n = d.nodes[id];
    let nxs = n.children.filter(c => N(d, c).next);
    if (nxs.length > 1) { nxs.slice(1).forEach(c => { N(d, c).next = false; }); nxs = nxs.slice(0, 1); }
    if (nxs.length) n.children = n.children.filter(c => c !== nxs[0]).concat(nxs);
    const nx = nxs[0];
    if (n.children.length - (nx ? 1 : 0) < 2) continue;
    const det = n.children.filter(c => c !== nx);
    const dated = det.map((c, i) => ({ c, i, d: ed(c) })).filter(x => x.d != null).sort((a, b) => (a.d! - b.d!) || (a.i - b.i));
    let k = 0;
    n.children = det.map(c => (ed(c) != null ? dated[k++].c : c)).concat(nx ? [nx] : []);
  }
}
