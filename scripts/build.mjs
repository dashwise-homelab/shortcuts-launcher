import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const version = process.argv[2];
if (!version) {
  throw new Error('Usage: node scripts/build.mjs <version>');
}
const buildOptions = {
  define: { __APP_VERSION__: JSON.stringify(version) },
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await Promise.all([
  build({
    ...buildOptions,
    entryPoints: ['src/main/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/main.cjs',
    external: ['electron', 'mqtt', 'sql.js', 'ws'],
    sourcemap: true,
  }),
  build({
    ...buildOptions,
    entryPoints: ['src/preload.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/preload.cjs',
    external: ['electron'],
    sourcemap: true,
  }),
  build({
    ...buildOptions,
    entryPoints: ['src/renderer/renderer.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: 'dist/renderer.js',
    sourcemap: true,
  }),
]);
await cp('src/renderer/index.html', 'dist/index.html');
await cp('src/renderer/styles.css', 'dist/styles.css');
await mkdir('dist/assets', { recursive: true });
await cp('src/renderer/assets/dashwise-icon.png', 'dist/assets/dashwise-icon.png');
await mkdir('dist/fonts', { recursive: true });
await cp(
  'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  'dist/fonts/geist-latin-wght-normal.woff2',
);
await cp('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/sql-wasm.wasm');
