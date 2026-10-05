import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({ root, plugins: [svelte({ configFile: false })],
  resolve: { alias: { $lib: fileURLToPath(new URL('../../../src/lib', import.meta.url)), '$app/navigation': `${root}navigation.ts`, '$app/stores': `${root}navigation.ts` } },
  server: { host: '127.0.0.1', port: 4176, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../../', import.meta.url)), realpathSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)))] } }
});
