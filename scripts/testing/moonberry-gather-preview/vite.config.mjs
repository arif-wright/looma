import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  root, publicDir: `${repository}static`, plugins: [svelte({ configFile: false })],
  // Keep the real production HUD visible, without development diagnostics covering it.
  define: { 'import.meta.env.DEV': 'false' },
  resolve: { alias: { $lib: `${repository}src/lib`, '$app/environment': `${root}environment.ts`, '@colyseus/sdk': `${root}fake-colyseus.ts` } },
  server: { host: '127.0.0.1', port: 4178, strictPort: true, hmr: false,
    fs: { allow: [repository, realpathSync(`${repository}node_modules`)] },
    headers: { 'Content-Security-Policy': "connect-src 'self'; form-action 'none'; frame-src 'none'" }
  }
});
