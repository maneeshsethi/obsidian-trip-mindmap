// Apply AI-proposed operations to a map (ported from reference agApply/agSet).
import { COLOR_KEYS, newNode, type MapDoc, type MMNode } from '../model/schema';
import { isDesc, nextOf, delNode } from '../model/ops';
import { fmt, okDate, toDay } from '../model/dates';
import { findPlace } from '../trip/route';

export type AiOp = Record<string, any> & { op: 'add' | 'update' | 'move' | 'delete' };
export interface ApplyResult { touched: string[]; lines: [string, string][]; skipped: number }

function setFields(d: MapDoc, n: MMNode, o: any) {
  if (typeof o.text === 'string' && o.text.trim()) n.text = o.text.trim().slice(0, 120);
  if ('notes' in o) { if (typeof o.notes === 'string' && o.notes.trim()) n.notes = o.notes.trim().slice(0, 4000); else delete n.notes; }
  if ('color' in o) { if ((COLOR_KEYS as readonly string[]).includes(o.color)) n.color = o.color; else delete n.color; }
  if (d.kind !== 'trip') return;
  if ('start' in o) n.start = okDate(o.start) ? o.start : null;
  if ('end' in o) n.end = okDate(o.end) ? o.end : null;
  if (typeof o.maybe === 'boolean') n.maybe = o.maybe;
  if (typeof o.fixed === 'boolean') n.fixed = o.fixed;
  if ('place' in o) {
    if (o.place == null || o.place === '') delete n.place;
    else if (String(o.place).toLowerCase() === 'none') n.place = '-';
    else { const p = findPlace(String(o.place)); if (p) n.place = p.name; }
  }
  if (!n.start) n.end = null;
  if (n.start && n.end && n.end < n.start) { const t = n.start; n.start = n.end; n.end = t; }
  if (n.end === n.start) n.end = null;
  if (n.fixed) n.end = null;
}

export function describe(d: MapDoc, n: MMNode): string {
  if (d.kind !== 'trip') return '';
  const b: string[] = [];
  if (n.start) b.push(n.end ? fmt(toDay(n.start)!) + '–' + fmt(toDay(n.end)!) : fmt(toDay(n.start)!));
  if (n.maybe) b.push('maybe'); if (n.fixed) b.push('booked');
  return b.length ? ' (' + b.join(', ') + ')' : '';
}

const countDesc = (d: MapDoc, id: string) => { let c = 0; const w = (x: string) => d.nodes[x].children.forEach(k => { c++; w(k); }); w(id); return c; };

export function applyOps(d: MapDoc, ops: unknown): ApplyResult {
  const refs: Record<string, string> = {}, touched = new Set<string>(), lines: [string, string][] = []; let skipped = 0;
  const R = (x: any) => (typeof x === 'string' && refs[x]) || x;
  const trip = d.kind === 'trip';
  for (const o of (Array.isArray(ops) ? ops : []).slice(0, 80) as any[]) {
    try {
      if (!o || typeof o !== 'object') { skipped++; continue; }
      if (o.op === 'add') {
        const pid = o.parent ? R(o.parent) : d.rootId; const p = d.nodes[pid];
        if (!p || !o.text) { skipped++; continue; }
        const n = newNode('', pid); setFields(d, n, o); if (!n.text) { skipped++; continue; }
        d.nodes[n.id] = n;
        if (trip && o.next && pid !== d.rootId) {
          const old = nextOf(d, pid); p.children.forEach(c => { d.nodes[c].next = false; }); n.next = true; p.children.push(n.id);
          if (old) { p.children.splice(p.children.indexOf(old), 1); d.nodes[old].parent = n.id; d.nodes[old].next = true; n.children.push(old); }
        } else p.children.push(n.id);
        p.collapsed = false; if (o.ref) refs[o.ref] = n.id; touched.add(n.id);
        lines.push(['+', `${n.text}${describe(d, n)}${n.next ? ' · next stop' : ''} → under ${p.text || 'Untitled'}`]);
      } else if (o.op === 'update') {
        const n = d.nodes[R(o.id)]; if (!n) { skipped++; continue; }
        const bt = n.text, bd = describe(d, n), bn = n.notes, bc = n.color; setFields(d, n, o); touched.add(n.id);
        const ch: string[] = [];
        if (n.text !== bt) ch.push(`renamed to “${n.text}”`);
        if (describe(d, n) !== bd) ch.push((describe(d, n) || ' (no dates)').trim());
        if (n.notes !== bn) ch.push(n.notes ? 'notes updated' : 'notes cleared');
        if (n.color !== bc) ch.push(n.color ? 'colour ' + n.color : 'colour cleared');
        lines.push(['~', `${bt}: ${ch.join(', ') || 'updated'}`]);
      } else if (o.op === 'move') {
        const id = R(o.id), pid = R(o.parent); const n = d.nodes[id], t = d.nodes[pid];
        if (!n || !t || id === d.rootId || id === pid || isDesc(d, pid, id)) { skipped++; continue; }
        const op = d.nodes[n.parent!]; op.children.splice(op.children.indexOf(id), 1); t.children.push(id); n.parent = pid; n.next = false;
        if (trip && o.next && pid !== d.rootId) { t.children.forEach(c => { if (c !== id) d.nodes[c].next = false; }); n.next = true; }
        touched.add(id); lines.push(['~', `${n.text}: moved under ${t.text}${n.next ? ' as next stop' : ''}`]);
      } else if (o.op === 'delete') {
        const id = R(o.id); const n = d.nodes[id]; if (!n || id === d.rootId) { skipped++; continue; }
        const k = countDesc(d, id);
        lines.push(['−', `${n.text}${k ? ` and ${k} sub-idea${k === 1 ? '' : 's'}` : ''}`]);
        touched.delete(id); delNode(d, id);
      } else skipped++;
    } catch { skipped++; }
  }
  for (const id of [...touched]) if (!d.nodes[id]) touched.delete(id);
  return { touched: [...touched], lines, skipped };
}
