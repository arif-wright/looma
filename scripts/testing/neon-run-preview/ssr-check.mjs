import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ configFile: `${root}vite.config.mjs`, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: NeonRun } = await server.ssrLoadModule('/../../../src/lib/components/games/NeonRun.svelte');
  const { fixture } = await server.ssrLoadModule('/runtime.ts');
  let factoryCalls = 0;
  const { body } = render(NeonRun, { props: { createGame() { factoryCalls++; throw new Error('Engine must not start during SSR.'); } } });
  assert.match(body, /Start run/);
  assert.match(body, /data-testid="neon-run-canvas"/);
  assert.match(body, /tabindex="0"/);
  assert.match(body, /data-phase="ready"/);
  assert.match(body, /Back to Play/);
  assert.doesNotMatch(body, /We couldn’t confirm your rewards/);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.blocked, []);
  assert.deepEqual(fixture.audioEvents, []);
  console.log('PASS: actual NeonRun SSR renders accessible ready state; no session, engine, audio or network starts.');
} finally { await server.close(); }
