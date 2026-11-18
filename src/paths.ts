// Pick a free "<folder>/<base>[ N].mindmap" path.
export function uniquePath(exists: (p: string) => boolean, folder: string, base: string): string {
  const dir = folder && folder !== '/' ? folder.replace(/\/+$/, '') + '/' : '';
  let p = `${dir}${base}.mindmap`;
  for (let i = 2; exists(p); i++) p = `${dir}${base} ${i}.mindmap`;
  return p;
}
