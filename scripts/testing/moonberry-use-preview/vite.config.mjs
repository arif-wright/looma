import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({ root, plugins: [svelte({ configFile: false })],
  resolve: { alias: { $lib: `${repository}src/lib`, '$app/navigation': `${root}navigation.ts`, '$app/stores': `${root}navigation.ts` } },
  server: { host: '127.0.0.1', port: 4182, strictPort: true, hmr: false, fs: { allow: [repository, realpathSync(`${repository}node_modules`)] }, headers: { 'Content-Security-Policy': "connect-src 'self'; form-action 'none'; frame-src 'none'" } }
});
