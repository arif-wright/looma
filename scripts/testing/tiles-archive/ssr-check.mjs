// Credential-free server-render/source contract checks. Not browser evidence.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const archivePath = 'src/routes/app/(archive)/games/tiles-run/+page.svelte';
const embedPath = 'src/routes/games/tiles-run/embed/+page.svelte';
const hubPath = 'src/routes/app/(protected)/games/+page.svelte';
const loaded = new Set();
const server = await createServer({
  configFile: false, root, envDir: false, publicDir: false, appType: 'custom',
  server: { middlewareMode: true, watch: null },
  ssr: { noExternal: ['svelte'] },
  plugins: [{ name: 'no-game-or-service-imports', enforce: 'pre', transform(_source, id) {
    loaded.add(id.split('?')[0]);
    assert.doesNotMatch(id, /GameWrapper\.svelte|games\/sdk\.ts|src\/lib\/games\/tiles-run\/|games\/endlessRunner\.ts|node_modules\/(?:@supabase|stripe)\//);
  } }, svelte({ configFile: false })],
  resolve: { alias: {
    '$lib': `${root}src/lib`,
    '$app/environment': `${root}tests/mocks/app-environment.ts`
  } }
});
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network operation in SSR'); };
try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: Archive } = await server.ssrLoadModule(`/${archivePath}`);
  const archive = render(Archive);
  assert.match(archive.body, /Tiles Run is archived/);
  assert.match(archive.body, /href="\/app\/games\/runner"/);
  assert.match(archive.body, /href="\/app\/games#reward-history"/);
  assert.match(archive.body, /Tiles Run leaderboards/);
  assert.match(archive.body, /View achievements/);
  assert.doesNotMatch(archive.body, /<iframe|<canvas|Start round|GAME_READY|SESSION_STARTED/);
  const { default: Embed } = await server.ssrLoadModule(`/${embedPath}`);
  const embed = render(Embed);
  assert.match(embed.body, /Tiles Run is archived/);
  assert.match(embed.body, /href="\/app\/games\/tiles-run" target="_top"/);
  assert.doesNotMatch(embed.body, /<iframe|<canvas|href="\/app\/games\/runner"/);
  const { default: Hub } = await server.ssrLoadModule(`/${hubPath}`);
  const { default: Grid } = await server.ssrLoadModule('/src/lib/components/games/GameGrid.svelte');
  const { games } = await server.ssrLoadModule('/src/lib/data/games.ts');
  for (const props of [{}, { items: games }]) {
    const { body } = render(Grid, { props });
    assert.doesNotMatch(body, /href="\/app\/games\/tiles-run"/);
    assert.match(body, /href="\/app\/games\/runner"/);
  }
  const tiles = { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 };
  const neon = { slug: 'runner', name: 'Neon Run', min_version: '1.0.0', max_score: 100000 };
  const rewards = [
    { id: 'archive-reward', game: 'tiles-run', gameName: 'Tiles Run', xpDelta: 12, currencyDelta: 24, insertedAt: null },
    { id: 'name-only', game: null, gameName: 'Tiles Run', xpDelta: 9, currencyDelta: 18, insertedAt: null }
  ];
  for (const catalog of [[tiles, neon], [], [tiles], undefined]) {
    const { body } = render(Hub, { props: { data: { games: catalog, playerState: { rewards } } } });
    assert.doesNotMatch(body, /href="\/app\/games\/tiles-run"|Play Tiles Run|Jump back into Tiles Run/);
    assert.match(body, /href="\/app\/games\/runner"/);
    assert.match(body, /id="reward-history"/);
    assert.match(body, /<strong[^>]*>Tiles Run<\/strong>/);
    assert.match(body, /\+12 XP/);
    assert.match(body, /\+24 shards/);
  }
  for (const path of [archivePath, embedPath]) {
    const source = await readFile(`${root}${path}`, 'utf8');
    assert.doesNotMatch(source, /import\s.*(?:GameWrapper|\/sdk|tiles-run\/embed|tiles-run\/engine)|session\/start|postMessage|location\.(?:href|replace)|goto\(/);
  }
  assert.equal(networkCalls, 0);
  console.log(`PASS: archive, legacy embed, default/explicit grid and four hub catalogs rendered from actual source (${loaded.size} modules); no session/engine/service imports or SSR network calls. Historical Tiles rewards remain visible. Browser hydration/navigation remains unverified.`);
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
