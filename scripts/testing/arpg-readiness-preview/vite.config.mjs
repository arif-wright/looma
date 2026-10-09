import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { readFileSync, realpathSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const assets = JSON.parse(readFileSync(`${root}asset-paths.json`, 'utf8'));
const sources = [
  'routes/app/(game)/games/arpg/+page.svelte', 'lib/games/arpg/main.ts',
  'lib/games/arpg/scenes/GameScene.ts', 'lib/games/arpg/assets/manifest.ts',
  'lib/games/arpg/expedition.ts', 'lib/games/arpg/townSession.ts',
  'lib/games/arpg/ecs/components.ts', 'lib/games/arpg/ecs/systems.ts',
  'lib/games/sdk.ts', 'lib/games/types.ts', 'lib/safeMessages.ts',
  'lib/games/rewardBonus.ts', 'lib/companions/rituals.ts'
].map(path => `${repository}src/${path}`);
const collaborators = [
  '$lib/supabase/client', '$lib/games/state', '$lib/stores/companions',
  '$lib/stores/companionRituals', '$lib/stores/companionReactions', '$lib/utils/analytics', '$lib/client/events/sendEvent', '$lib/achievements/store'
];
const presentation = [
  '$lib/ui/BackgroundStack.svelte', '$lib/components/ui/OrbPanel.svelte',
  '$lib/components/games/LeaderboardTabs.svelte', '$lib/components/games/LeaderboardList.svelte',
  '$lib/components/games/AchievementToastStack.svelte'
];
function assetServer(server) {
  // Fail closed before preview starts if the full checkout's real PNGs are
  // absent. A local bundle build never substitutes generated/test image bytes.
  const bytes = new Map(assets.map(path => [path, readFileSync(`${repository}static${path}`)]));
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4281');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      response.statusCode = 403; response.end('API network calls are forbidden.'); return;
    }
    if (!url.pathname.startsWith('/games/arpg/')) return next();
    if (!['GET', 'HEAD'].includes(request.method ?? '') || url.search || !bytes.has(url.pathname)) {
      response.statusCode = 403; response.end('Undeclared asset request.'); return;
    }
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : bytes.get(url.pathname));
  });
}
export default defineConfig({
  root, envDir: false, publicDir: false,
  plugins: [{
    name: 'arpg-real-engine-boundary', enforce: 'pre',
    configureServer: assetServer,
    configurePreviewServer: assetServer,
    transform(_source, id) {
      const path = id.split('?')[0];
      if (path.startsWith(`${repository}src/`) && !sources.includes(path)) throw new Error(`Unexpected application module: ${path}`);
      if (/[/\\]node_modules[/\\](@supabase|stripe)[/\\]/.test(path)) throw new Error(`Live service dependency forbidden: ${path}`);
    }
  }, svelte({ configFile: false })],
  resolve: { alias: [
    ...collaborators.map(find => ({ find, replacement: `${root}collaborators.ts` })),
    ...presentation.map(find => ({ find, replacement: `${root}Presentation.svelte` })),
    ...['$app/stores', '$app/navigation'].map(find => ({ find, replacement: `${root}navigation.ts` })),
    { find: '$lib', replacement: `${repository}src/lib` }
  ] },
  server: { host: '127.0.0.1', port: 4281, strictPort: true, hmr: false,
    fs: { allow: [root, ...sources, realpathSync(`${repository}node_modules`)], deny: ['**/.env*', '**/*.{pem,key}', '**/.git/**'] } },
  preview: { host: '127.0.0.1', port: 4281, strictPort: true },
  build: { target: 'es2022', outDir: `${root}.build`, emptyOutDir: true }
});
