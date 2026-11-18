// Convert artifact db exports (one JSON per map) into .mindmap files.
// Usage: npm run migrate -- <exportDir> <outDir>
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromArtifact, serializeMap, parseMap } from '../src/model/schema';

const [, , inDir, outDir] = process.argv;
if (!inDir || !outDir) { console.error('usage: migrate <exportDir> <outDir>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const f of readdirSync(inDir).filter(f => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(inDir, f), 'utf8'));
  const doc = fromArtifact(raw);
  const name = (doc.title || f.replace(/\.json$/, '')).replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
  const dest = join(outDir, name + '.mindmap');
  if (existsSync(dest)) { console.log(`skip  ${dest} (exists)`); continue; }
  const text = serializeMap(doc);
  const back = parseMap(text, name);
  const n = Object.keys(raw.nodes).length;
  if (!back.ok || Object.keys(back.doc.nodes).length !== n) { console.log(`FAIL  ${f}`); failed++; continue; }
  writeFileSync(dest, text);
  console.log(`wrote ${dest} (${n} ideas, ${doc.kind})`);
}
process.exit(failed ? 1 : 0);
