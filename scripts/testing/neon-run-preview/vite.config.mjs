import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync, readFileSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const nodeModules = `${repositoryRoot}node_modules`;
const assetNames = ['background.webp', 'ground.webp', 'props.webp', 'adventurer.webp', 'echo.webp'];
const assetBase = '/games/runner/skins/lanternway/';
export default defineConfig({
  root, envDir: false, publicDir: false,
  plugins: [{
    name: 'neon-run-fixture-skin-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (!assetNames.some((name) => path === `${assetBase}${name}`)) return next();
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.statusCode = 405; response.end(); return; }
        response.setHeader('Content-Type', 'image/webp');
        response.end(request.method === 'HEAD' ? undefined : readFileSync(`${repositoryRoot}static${path}`));
      });
    },
    generateBundle() {
      for (const name of assetNames) {
        const fileName = `${assetBase.slice(1)}${name}`;
        this.emitFile({ type: 'asset', fileName, source: readFileSync(`${repositoryRoot}static/${fileName}`) });
      }
    }
  }, {
    name: 'neon-run-fixture-source-boundary', enforce: 'pre',
    transform(_source, id) {
      const path = id.split('?')[0];
      if (path.startsWith(`${repositoryRoot}src/`) && ![
        `${repositoryRoot}src/lib/components/games/NeonRun.svelte`,
        `${repositoryRoot}src/lib/games/endlessRunner.ts`,
        `${repositoryRoot}src/lib/games/runnerLanternwaySkin.ts`,
        `${repositoryRoot}src/lib/games/runnerLanternwayAtlas.ts`,
        `${repositoryRoot}src/lib/games/types.ts`
      ].includes(path)) throw new Error(`Neon Run fixture blocked unexpected application import: ${path}`);
      if (/[/\\]node_modules[/\\](@supabase|stripe)[/\\]/.test(path)) throw new Error('Neon Run fixture must not import a live-service client.');
    }
  }, svelte({ configFile: false })],
  resolve: { alias: [
    { find: '$lib/games/sdk', replacement: `${root}sdk.ts` },
    { find: '$lib/games/audio', replacement: `${root}audio.ts` },
    { find: /^\.\/audio$/, replacement: `${root}audio.ts` },
    { find: '$lib/games/state', replacement: `${root}state.ts` },
    { find: '$lib/stores/companionRituals', replacement: `${root}state.ts` },
    { find: '$app/navigation', replacement: `${root}navigation.ts` },
    { find: '$app/stores', replacement: `${root}navigation.ts` },
    { find: '$app/state', replacement: `${root}navigation.ts` },
    { find: '$app/environment', replacement: `${root}environment.ts` },
    { find: '$lib', replacement: `${repositoryRoot}src/lib` }
  ] },
  server: { host: '127.0.0.1', port: 4178, strictPort: true,
    fs: { allow: [repositoryRoot, ...(existsSync(nodeModules) ? [realpathSync(nodeModules)] : [])] } },
  build: { outDir: `${root}.build`, emptyOutDir: true }
});
