// .mindmap file schema: the reference artifact's flat node map, plus `kind`.
// Pure module — no obsidian imports, no DOM.

export type Kind = 'general' | 'trip';
export const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface MMNode {
  id: string;
  text: string;
  parent: string | null;
  children: string[];
  notes?: string;
  collapsed: boolean;
  off?: { x: number; y: number } | null;
  side: 'L' | 'R' | null;
  start: string | null;
  end: string | null;
  maybe: boolean;
  fixed: boolean;
  place?: string;
  next?: boolean;
  color?: ColorKey;
}

export interface MapDoc {
  version: 1;
  kind: Kind;
  title: string;
  layout: 'right' | 'both';
  rootId: string;
  nodes: Record<string, MMNode>;
  snap: boolean;
  cal: boolean;
  mode: 'a' | 'b' | 'c';
  createdAt: number;
  updatedAt: number;
}

export const rid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function newNode(text: string, parent: string | null, o?: Partial<MMNode>): MMNode {
  return Object.assign(
    { id: 'n' + rid(), text: text || '', parent: parent || null, children: [], start: null, end: null, maybe: false, fixed: false, collapsed: false, side: null },
    o || {},
  ) as MMNode;
}

export function newMap(kind: Kind, title: string): MapDoc {
  const r = newNode(title || 'New map', null);
  const now = Date.now();
  return { version: 1, kind, title: title || 'New map', layout: 'right', rootId: r.id, nodes: { [r.id]: r }, snap: true, cal: false, mode: 'b', createdAt: now, updatedAt: now };
}

const DROP = ['example', 'unsaved', 'rev', 'id'];
const isColor = (c: unknown): c is ColorKey => typeof c === 'string' && (COLOR_KEYS as readonly string[]).includes(c);

function validate(d: any): string | null {
  if (!d || typeof d !== 'object' || !d.nodes || typeof d.nodes !== 'object') return 'missing "nodes"';
  if (typeof d.rootId !== 'string' || !d.nodes[d.rootId]) return `root node "${d.rootId}" not found`;
  for (const id in d.nodes) {
    const n = d.nodes[id];
    if (!n || typeof n !== 'object' || !Array.isArray(n.children)) return `node "${id}" is malformed`;
    for (const c of n.children) if (!d.nodes[c]) return `node "${id}" lists missing child "${c}"`;
    if (id !== d.rootId && (n.parent == null || !d.nodes[n.parent])) return `node "${id}" has missing parent "${n.parent}"`;
  }
  // every parent/child link must agree both ways, and each node is listed exactly once
  if (d.nodes[d.rootId].parent != null) return 'root node has a parent';
  const listed = new Set<string>();
  for (const id in d.nodes) for (const c of d.nodes[id].children) {
    if (listed.has(c)) return `node "${c}" is listed more than once`;
    if (c === d.rootId) return 'root node is listed as a child';
    if (d.nodes[c].parent !== id) return `node "${c}" is listed under "${id}" but its parent is "${d.nodes[c].parent}"`;
    listed.add(c);
  }
  for (const id in d.nodes) if (id !== d.rootId && !listed.has(id)) return `node "${id}" is missing from its parent's children`;
  // cycle / reachability: every node's parent chain must reach the root
  for (const id in d.nodes) {
    let x: string | null = id, steps = 0;
    while (x !== d.rootId) {
      x = d.nodes[x!].parent;
      if (x == null || ++steps > 100000) return `node "${id}" is not connected to the root (cycle?)`;
    }
  }
  return null;
}

export function parseMap(text: string, fallbackTitle: string): { ok: true; doc: MapDoc } | { ok: false; error: string } {
  if (!text || !text.trim()) return { ok: true, doc: newMap('general', fallbackTitle) };
  let d: any;
  try { d = JSON.parse(text); } catch (e: any) { return { ok: false, error: 'Not valid JSON: ' + (e?.message || e) }; }
  const err = validate(d);
  if (err) return { ok: false, error: err };
  for (const k of DROP) delete d[k];
  for (const id in d.nodes) { const n = d.nodes[id]; if ('color' in n && !isColor(n.color)) delete n.color; }
  if (d.kind !== 'general' && d.kind !== 'trip') d.kind = Object.values<any>(d.nodes).some(n => n.start) ? 'trip' : 'general';
  d.version = 1;
  d.title = typeof d.title === 'string' ? d.title : fallbackTitle;
  d.layout = d.layout === 'both' ? 'both' : 'right';
  d.snap = d.snap !== false;
  d.cal = !!d.cal;
  d.mode = d.mode === 'a' || d.mode === 'c' ? d.mode : 'b';
  d.createdAt = typeof d.createdAt === 'number' ? d.createdAt : Date.now();
  d.updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : d.createdAt;
  return { ok: true, doc: d as MapDoc };
}

export function serializeMap(doc: MapDoc): string {
  const o: any = { ...doc };
  for (const k of DROP) delete o[k];
  const ordered = { version: 1, kind: o.kind, title: o.title, layout: o.layout, rootId: o.rootId, nodes: o.nodes, snap: o.snap, cal: o.cal, mode: o.mode, createdAt: o.createdAt, updatedAt: o.updatedAt };
  return JSON.stringify(ordered, null, 2) + '\n';
}

export function convertKind(doc: MapDoc, kind: Kind): MapDoc {
  return { ...structuredClone(doc), kind };
}

export function fromArtifact(raw: any): MapDoc {
  const r = parseMap(JSON.stringify({ ...raw, kind: 'trip' }), raw?.title || 'Trip');
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}
