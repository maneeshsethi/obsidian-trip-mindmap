// Map → indented Markdown list ("Copy as outline").
import type { MapDoc, MMNode } from './schema';

function suffix(d: MapDoc, n: MMNode): string {
  if (d.kind !== 'trip') return '';
  let s = '';
  if (n.start) s += n.end ? ` (${n.start} → ${n.end})` : ` (${n.start})`;
  if (n.maybe) s += ' _maybe_';
  if (n.fixed) s += ' **booked**';
  return s;
}

export function toOutline(d: MapDoc): string {
  const root = d.nodes[d.rootId];
  const lines = [`# ${root.text || d.title || 'Untitled'}${suffix(d, root)}`, ''];
  const walk = (id: string, depth: number) => {
    const n = d.nodes[id], ind = '  '.repeat(depth);
    lines.push(`${ind}- ${n.text || 'Untitled'}${suffix(d, n)}`);
    if (n.notes) for (const l of n.notes.split('\n')) lines.push(`${ind}  > ${l}`.trimEnd());
    n.children.forEach(c => walk(c, depth + 1));
  };
  root.children.forEach(c => walk(c, 0));
  return lines.join('\n') + '\n';
}
