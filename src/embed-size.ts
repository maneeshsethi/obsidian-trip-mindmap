// Height for an embedded map from the embed's alias: ![[x.mindmap|600]] or |600x300.
export function embedHeight(alt: string | null | undefined): number {
  const m = /^\s*(\d+)(?:\s*x\s*(\d+))?\s*$/.exec(alt ?? '');
  if (!m) return 400;
  const h = Number(m[2] ?? m[1]);
  return Math.max(150, Math.min(1200, h));
}
