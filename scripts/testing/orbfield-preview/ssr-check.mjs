import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ configFile: `${root}vite.config.mjs`, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: GameShell } = await server.ssrLoadModule('/../../../src/lib/games/GameShell.svelte');
  const { fixture } = await server.ssrLoadModule('/runtime.ts');
  let factoryCalls = 0;
  const { body } = render(GameShell, { props: {
    title: 'Orbfield', description: 'Synthetic intro inspection', gameId: 'dodge', clientVersion: '1.0.0', fullScreen: true,
    createGame() { factoryCalls++; throw new Error('Game engine must not start during SSR.'); }
  } });
  assert.match(body, /Start round/);
  assert.match(body, /aria-label="Orbfield play area"/);
  assert.match(body, /tabindex="0"/);
  assert.match(body, /data-phase="ready"/);
  assert.match(body, /Back to Play/);
  assert.doesNotMatch(body, /Round complete|We couldn’t confirm your rewards/);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.blocked, []);
  console.log('PASS: actual GameShell SSR renders accessible ready state; no session, engine or network starts.');
} finally { await server.close(); }
