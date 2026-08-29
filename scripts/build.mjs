import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await Promise.all([
  build({ entryPoints: ['src/main/index.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/main.cjs', external: ['mqtt', 'sql.js', 'ws'], sourcemap: true }),
  build({ entryPoints: ['src/preload.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/preload.cjs', sourcemap: true }),
  build({ entryPoints: ['src/renderer/renderer.ts'], bundle: true, platform: 'browser', format: 'iife', outfile: 'dist/renderer.js', sourcemap: true })
]);
await cp('src/renderer/index.html', 'dist/index.html');
await cp('src/renderer/styles.css', 'dist/styles.css');
await cp('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/sql-wasm.wasm');
