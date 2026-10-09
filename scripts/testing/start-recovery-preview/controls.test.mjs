// Node-only control self-test. Does NOT launch or simulate a real browser, mount
// either shell, validate the SDK, decode artwork, or confer browser test passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(`${root}.results`, { recursive: true });
await build({ entryPoints: [`${root}controls-entry.ts`], outfile: `${root}.results/controls.bundle.mjs`,
  bundle: true, format: 'esm', platform: 'node', conditions: ['browser'], logLevel: 'warning' });
let instance = 0;
async function fresh(query = '') {
  const values = new Map();
  globalThis.location = new URL(`http://127.0.0.1:4279/preview?${query}`);
  globalThis.sessionStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  globalThis.window = {};
  const runtime = await import(`./.results/controls.bundle.mjs?instance=${instance++}`);
  runtime.installSyntheticTransport();
  return runtime;
}
const request = (signal) => window.fetch('/api/games/session/start', { method: 'POST', body: '{}', signal });

test('fetch control remains pending, records abort and releases original/new identities', async () => {
  const { fixture } = await fresh('stage=fetch');
  const controller = new AbortController();
  const response = request(controller.signal);
  assert.equal(fixture.api[0].stage, 'fetch-pending');
  controller.abort(); assert.equal(fixture.api[0].aborted, true);
  await fixture.releaseStart();
  assert.equal((await (await response).json()).sessionId, 'original-session');
  assert.equal((await (await request()).json()).sessionId, 'new-session-1');
  assert.equal(fixture.snapshot().persistedStarts, 2);
});
for (const stage of ['body', 'error-body']) {
  test(`${stage} control exposes body readiness and releases after abort`, async () => {
    const { fixture } = await fresh(`stage=${stage}`);
    const controller = new AbortController();
    const response = await request(controller.signal);
    const body = response.json();
    assert.equal(fixture.api[0].stage, 'body-pending');
    assert.equal(response.ok, stage !== 'error-body');
    controller.abort(); await fixture.releaseStart();
    const value = await body;
    assert.equal(fixture.api[0].stage, 'responded');
    assert.equal(fixture.api[0].aborted, true);
    if (stage === 'body') assert.equal(value.sessionId, 'original-session');
    else assert.equal(value.code, 'synthetic_server_error');
  });
}
test('transport rejects external, legacy API, wrong-method and query-bearing attempts without native fetch', async () => {
  const { fixture } = await fresh();
  for (const [url, init] of [
    ['https://example.invalid/api/games/session/start', { method: 'POST' }],
    ['/api/games/player/state', {}], ['/api/games/session/start', { method: 'GET' }],
    ['/api/games/session/start?secret=no', { method: 'POST' }]
  ]) await assert.rejects(window.fetch(url, init), /Forbidden fetch/);
  assert.equal(fixture.blocked.length, 4); assert.equal(fixture.api.length, 0);
});
test('Auth hold/emit/unsubscribe controls preserve owner-event order', async () => {
  const { fixture, createSupabaseBrowserClient } = await fresh('auth=hold');
  const calls = [];
  const { data: { subscription } } = createSupabaseBrowserClient().auth.onAuthStateChange((event, session) => calls.push([event, session?.user.id ?? null]));
  await Promise.resolve(); assert.deepEqual(calls, []);
  fixture.emitAuth('SIGNED_IN', 'owner-b'); fixture.emitAuth('SIGNED_OUT', null);
  subscription.unsubscribe(); fixture.emitAuth('TOKEN_REFRESHED', 'owner-a');
  assert.deepEqual(calls, [['SIGNED_IN', 'owner-b'], ['SIGNED_OUT', null]]);
  assert.equal(fixture.callbacks.size, 0);
});
test('Auth initial callback honors unsubscribe and unavailable mode fails explicitly', async () => {
  let runtime = await fresh();
  const calls = [];
  const result = runtime.createSupabaseBrowserClient().auth.onAuthStateChange((event) => calls.push(event));
  result.data.subscription.unsubscribe(); await Promise.resolve(); assert.deepEqual(calls, []);
  runtime = await fresh('auth=unavailable');
  assert.throws(() => runtime.createSupabaseBrowserClient().auth.onAuthStateChange(() => {}), /Synthetic unavailable Auth/);
  assert.equal(runtime.fixture.callbacks.size, 0);
});
test('post-artwork gate reports readiness and releases only on explicit command', async () => {
  const { fixture } = await fresh('holdArt=1');
  let settled = false;
  const promise = fixture.waitForArtGate({ complete: true, assets: { original: true } }).then((value) => { settled = true; return value; });
  await Promise.resolve(); assert.equal(fixture.artLoaded, true); assert.equal(settled, false);
  await fixture.releaseArt(); assert.equal((await promise).complete, true); assert.equal(settled, true);
});
test('fake engine records lifecycle and rejects completion after destruction', async () => {
  const { fixture, createEndlessRunner } = await fresh();
  let completions = 0;
  const engine = createEndlessRunner({ canvas: {}, onGameOver: () => { completions++; } });
  engine.start(); engine.pause(); engine.resume();
  fixture.finish({ score: 1, durationMs: 250, meta: {} });
  assert.equal(completions, 1); engine.destroy();
  assert.throws(() => fixture.finish({ score: 1, durationMs: 250 }), /cannot finish/);
  assert.deepEqual(fixture.engineEvents, ['0:start', '0:pause', '0:resume', '0:destroy']);
});
