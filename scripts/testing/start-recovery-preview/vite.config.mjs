import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { realpathSync, readFileSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const sourceFiles = [
  'lib/components/games/NeonRun.svelte', 'lib/games/GameShell.svelte', 'lib/games/sdk.ts',
  'lib/games/runnerLanternwaySkin.ts', 'lib/games/runnerLanternwayAtlas.ts',
  'lib/games/orbfieldSkin.ts', 'lib/safeMessages.ts', 'lib/games/types.ts', 'lib/companions/rituals.ts'
].map((path) => `${repository}src/${path}`);
const assets = [
  ...['background', 'ground', 'props', 'adventurer', 'echo'].map((name) => `/games/runner/skins/lanternway/${name}.webp`),
  ...['arena', 'pearl-wisp', 'thorn-mote', 'muse'].map((name) => `/games/dodge/skins/moonlit/${name}.webp`)
];
export default defineConfig({
  root, envDir: false, publicDir: false,
  plugins: [{
    name: 'start-recovery-boundary', enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (path === '/api' || path.startsWith('/api/')) {
          response.statusCode = 403; response.end('Application API network calls are forbidden in this fixture.'); return;
        }
        if (!assets.includes(path)) return next();
        if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.statusCode = 405; response.end(); return; }
        response.setHeader('Content-Type', 'image/webp');
        response.end(request.method === 'HEAD' ? undefined : readFileSync(`${repository}static${path}`));
      });
    },
    configurePreviewServer(server) {
      // The built fixture has no Vite dev client or HMR WebSocket. Keep the
      // application-API boundary when serving only its generated assets.
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (path === '/api' || path.startsWith('/api/')) {
          response.statusCode = 403; response.end('Application API network calls are forbidden in this fixture.'); return;
        }
        next();
      });
    },
    generateBundle() {
      for (const path of assets) this.emitFile({ type: 'asset', fileName: path.slice(1), source: readFileSync(`${repository}static${path}`) });
    },
    transform(_source, id) {
      const path = id.split('?')[0];
      if (path.startsWith(`${repository}src/`) && !sourceFiles.includes(path)) {
        throw new Error(`Fixture blocked unexpected application module: ${path}`);
      }
      if (/[/\\]node_modules[/\\](@supabase|stripe|phaser)[/\\]/.test(path)) {
        throw new Error(`Fixture must not import live-service or real-engine code: ${path}`);
      }
    }
  }, svelte({ configFile: false })],
  resolve: { alias: [
    ...['$lib/supabase/client', '$lib/games/state', '$lib/stores/companions', '$lib/stores/companionRituals',
      '$lib/stores/companionReactions', '$lib/utils/analytics', '$lib/client/events/sendEvent', '$lib/games/audio']
      .map((find) => ({ find, replacement: `${root}collaborators.ts` })),
    { find: '$lib/games/endlessRunner', replacement: `${root}engines.ts` },
    { find: '$lib/games/runnerLanternwaySkin', replacement: `${root}skins.ts` },
    { find: /^\.\/orbfieldSkin$/, replacement: `${root}skins.ts` },
    { find: '$app/stores', replacement: `${root}navigation.ts` },
    { find: '$app/navigation', replacement: `${root}navigation.ts` },
    { find: '$lib', replacement: `${repository}src/lib` }
  ] },
  server: { host: '127.0.0.1', port: 4279, strictPort: true, hmr: false,
    fs: { allow: [root, ...sourceFiles, realpathSync(`${repository}node_modules`)],
      deny: ['**/.env*', '**/*.{pem,key}', '**/.git/**'] } },
  preview: { host: '127.0.0.1', port: 4279, strictPort: true },
  build: { outDir: `${root}.build`, emptyOutDir: true }
});
