import { context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('src/index.html', 'dist/index.html');
for (const [entry, outfile, platform] of [
  ['src/app.ts', 'dist/app.js', 'browser'],
  ['src/core.ts', 'dist/core.mjs', 'node'],
]) {
  const ctx = await context({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform,
    sourcemap: true,
    define: { __OFFLINE_HTML__: 'false' },
  });
  await ctx.watch();
  await ctx.rebuild();
}
await import('../server/main.mjs');
