import esbuild from 'esbuild';
const prod = process.argv[2] === 'production';
const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  loader: { '.json': 'json' },
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  minify: prod,
  outfile: 'main.js',
});
if (prod) { await ctx.rebuild(); process.exit(0); } else { await ctx.watch(); }
