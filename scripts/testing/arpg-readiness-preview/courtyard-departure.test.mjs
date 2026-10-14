import { beforeWestInnerSetup } from './courtyard-setup-preservation.mjs';
// Offline native-call and deadline models. No browser, engine execution or
// native departure proof is produced by these tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const source = read('./courtyard-departure.ts');
const compiled = ts.transpileModule(source, { fileName: 'courtyard-departure.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function model({ down = () => Promise.resolve(), up = () => Promise.resolve() } = {}) {
  let now = 0, serial = 0;
  const events = [], timers = new Map(), module = { exports: {} };
  const page = { keyboard: {
    down: key => { events.push(['down', key, now]); return down(); },
    up: key => { events.push(['up', key, now]); return up(); }
  } };
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports,
    performance: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id), Error, AggregateError
  });
  return { events, timers,
    run: acknowledge => module.exports.departCourtyard(page, acknowledge),
    jump: time => { now = time; },
    async advance(time) {
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      now = time; await flush();
    }
  };
}
const outcome = promise => promise.then(() => ({ passed: true }), error => ({ passed: false, error }));
const releasedOnce = m => assert.equal(m.events.filter(e => e[0] === 'up').length, 1);
const downOnce = m => assert.equal(m.events.filter(e => e[0] === 'down').length, 1);

test('departure helper has clean TypeScript syntax and one native down/up, without synthetic input or retries', () => {
  assert.deepEqual(compiled.diagnostics, []);
  assert.equal((source.match(/page\.keyboard\.down\('e'\)/g) || []).length, 1);
  assert.equal((source.match(/page\.keyboard\.up\('e'\)/g) || []).length, 1);
  assert.doesNotMatch(source, /keyboard\.press|dispatchEvent|evaluate\(|fetch\(|request\.|setInterval|waitForTimeout|\.launch\(|for\s*\(|while\s*\(/);
  assert(source.indexOf("await page.keyboard.up('e')") > source.indexOf('} finally {'));
});

test('successful acknowledgment releases E exactly once and clears the deadline', async () => {
  const m = model(); let calls = 0;
  await m.run(async remaining => { calls++; assert.equal(remaining(), 15000); assert.deepEqual(m.events, [['down', 'e', 0]]); });
  assert.equal(calls, 1); assert.deepEqual(m.events, [['down', 'e', 0], ['up', 'e', 0]]); assert.equal(m.timers.size, 0);
  await m.advance(30000); releasedOnce(m); downOnce(m);
});

test('key delivery and delayed acknowledgment share one total 15000ms deadline', async () => {
  const key = deferred(), ack = deferred(), m = model({ down: () => key.promise }); let remainingAtAck;
  const result = outcome(m.run(async remaining => { remainingAtAck = remaining(); await ack.promise; }));
  await m.advance(5000); key.resolve(); await flush(); assert.equal(remainingAtAck, 10000);
  await m.advance(14999); assert.deepEqual(m.events, [['down', 'e', 0]]);
  ack.resolve(); await flush(); assert.deepEqual(await result, { passed: true });
  assert.deepEqual(m.events.at(-1), ['up', 'e', 14999]); assert.equal(m.timers.size, 0);
});

for (const stage of ['down', 'acknowledge']) for (const kind of ['synchronous', 'asynchronous']) test(`${kind} ${stage} failure releases E and preserves the error`, async () => {
  const error = Error(`${kind} ${stage}`), fail = () => { if (kind === 'synchronous') throw error; return Promise.reject(error); };
  const m = model(stage === 'down' ? { down: fail } : {}); let calls = 0;
  const result = await outcome(m.run(stage === 'acknowledge' ? fail : async () => { calls++; }));
  assert.equal(result.error, error); assert.equal(result.passed, false);
  if (stage === 'down') assert.equal(calls, 0);
  downOnce(m); releasedOnce(m); assert.equal(m.timers.size, 0);
});

for (const stage of ['down', 'acknowledge']) for (const late of ['resolve', 'reject']) test(`${stage} timeout releases at 15000ms; late ${late} cannot acknowledge again or repeat input`, async () => {
  const pending = deferred(), m = model(stage === 'down' ? { down: () => pending.promise } : {}); let calls = 0;
  const result = outcome(m.run(async () => { calls++; if (stage === 'acknowledge') await pending.promise; }));
  await flush(); await m.advance(14999); assert.equal(m.events.length, 1);
  await m.advance(15000); const value = await result;
  assert.equal(value.passed, false); assert.match(value.error.message, /exceeded 15000ms/);
  assert.deepEqual(m.events.at(-1), ['up', 'e', 15000]); assert.equal(calls, stage === 'down' ? 0 : 1);
  pending[late](late === 'reject' ? Error('late failure') : undefined); await flush(); await m.advance(30000);
  releasedOnce(m); downOnce(m); assert.equal(calls, stage === 'down' ? 0 : 1); assert.equal(m.timers.size, 0);
});

test('acknowledgment at the deadline fails even before the timer callback can run', async () => {
  const m = model(); const result = await outcome(m.run(async () => { m.jump(15000); }));
  assert.match(result.error.message, /exceeded 15000ms/); releasedOnce(m); assert.equal(m.timers.size, 0);
});

test('saved remaining budget fails closed after cleanup, preventing late read-only polling', async () => {
  const m = model(); let remaining;
  await m.run(async budget => { remaining = budget; });
  assert.throws(() => remaining(), /exceeded 15000ms/); releasedOnce(m);
});

for (const kind of ['synchronous', 'asynchronous']) for (const failed of [false, true]) test(`${kind} release failure is visible${failed ? ' alongside the original acknowledgment error' : ' after acknowledgment'}`, async () => {
  const releaseError = Error('cannot release E'), original = Error('ack failed');
  const m = model({ up: () => { if (kind === 'synchronous') throw releaseError; return Promise.reject(releaseError); } });
  const result = await outcome(m.run(async () => { if (failed) throw original; }));
  assert.equal(result.passed, false);
  if (failed) { assert(result.error instanceof AggregateError); assert.deepEqual(result.error.errors, [original, releaseError]); }
  else assert.equal(result.error, releaseError);
  downOnce(m); releasedOnce(m); assert.equal(m.timers.size, 0);
});

test('timeout plus release failure preserves both causes and performs no retry', async () => {
  const releaseError = Error('cannot release E'), m = model({ up: () => Promise.reject(releaseError) });
  const result = outcome(m.run(() => deferred().promise)); await flush(); await m.advance(15000);
  const { error } = await result; assert(error instanceof AggregateError); assert.match(error.errors[0].message, /exceeded 15000ms/); assert.equal(error.errors[1], releaseError);
  releasedOnce(m); downOnce(m); assert.equal(m.timers.size, 0);
});

test('a falsy thrown failure is retained when cleanup also fails', async () => {
  const releaseError = Error('release'), m = model({ up: () => { throw releaseError; } });
  const result = await outcome(m.run(() => { throw undefined; }));
  assert(result.error instanceof AggregateError); assert.deepEqual(result.error.errors, [undefined, releaseError]);
});

test('release is awaited, without extending or restarting the acknowledgment timer', async () => {
  const release = deferred(), m = model({ up: () => release.promise }); let settled = false;
  const result = m.run(async () => {}).then(() => { settled = true; }); await flush();
  assert.equal(settled, false); assert.equal(m.timers.size, 0); await m.advance(30000); assert.equal(settled, false);
  release.resolve(); await result; releasedOnce(m); downOnce(m);
});

const driver = read('./courtyard-browser.ts');
const ast = ts.createSourceFile('courtyard-browser.ts', driver, ts.ScriptTarget.Latest, true);
let departure;
const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'departCourtyard') { assert.equal(departure, undefined); departure = node; } ts.forEachChild(node, visit); };
visit(ast);
const callback = departure.arguments[1];
const guard = ts.createSourceFile('guard.ts', read('./guard.ts'), ts.ScriptTarget.Latest, true);
const expedition = guard.statements.flatMap(s => ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []).find(d => d.name.getText(guard) === 'expedition').initializer;
const normalize = text => text.replace(/\s+/g, '');

test('native acknowledgment retains both exact historical expedition assertions; only remaining-budget checks are added', () => {
  const actual = callback.body.getText(ast).replace(/\s*remaining\(\);/g, '').replace(/, \{ timeout: remaining\(\) \}/g, '');
  const original = expedition.body.getText(guard).replace('screen(page, id)', 'screen(page)').replace('scene.pageId === id', 'scene.pageId === 1');
  assert.equal(normalize(actual), normalize(original));
  assert.equal((callback.body.getText(ast).match(/timeout: remaining\(\)/g) || []).length, 2);
  assert.equal((callback.body.getText(ast).match(/remaining\(\);/g) || []).length, 2);
});

test('native driver changes only the E departure import and call, preserving every route, capture, reward and cleanup assertion', () => {
  let original = beforeWestInnerSetup('courtyard-browser.ts',driver).replace("import { departCourtyard } from './courtyard-departure';\n", '').replace('gameplay, screen', 'gameplay, expedition, screen');
  original = original.replace(departure.getText(ast), "page.keyboard.press('e');await expedition(page)");
  assert.equal(createHash('sha256').update(original).digest('hex'), '11e859670c44e0c1388afcf63f737ae68b611e85d5fb2afd52a0d8ddd87e3c25');
  assert.equal((driver.match(/departCourtyard\(page/g) || []).length, 1);
});

test('native budgets, zero retries, session cardinality and historical navigation remain pinned', () => {
  const pins = JSON.parse('{"./guard.ts":"853558aedcab5363cba542d5401be17daf4e9675968a8288ce9d7ddc757ee173","./plaza-browser.ts":"6babf820e9afe0ad69dfa01ba722439dfc66875a1520f219fc225c0f549efeed","./courtyard-navigation.ts":"92a9e52a9a9bc9f2b88f94b9b601925378d9bc5060851ff14dbb67953b74f709","./courtyard-navigation.test.mjs":"f332bcb8bbd18ce9e3e7511eb12064a3715e0f0797deee377414ed5f178decd3","./courtyard-contract.mjs":"013952b2b1b29ad63a1610ccf8d314f4be749bfd2cb7d150f41a5269073e5d3c","./verify-courtyard.mjs":"fac548f0a2d3b433f4959308217a3d71f075ad178cf111a5736e1545bab21e41","./courtyard-native.test.mjs":"a277e4c3aea1c6ca22160a2e7ab8c21621dd81474f76e1e3cc3f9332419c1705","./courtyard.playwright.config.ts":"e623b1c92030f4a1b1438b0c107937eb4f54def758eea59199762b450f766c02","./protocol.mjs":"3a2557002f82071c4d0e4b9ae0763bda8dd8f5311058d55f81ba81d8dbe81643"}');
  for (const [name, hash] of Object.entries(pins)) assert.equal(createHash('sha256').update(beforeWestInnerSetup(name.replace('./',''),read(name))).digest('hex'), hash, name);
  assert.match(read('./courtyard.playwright.config.ts'), /workers: 1, retries: 0, timeout: 600_000/);
});

const callbackJS = ts.transpileModule(`exports.acknowledge = ${callback.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function acknowledgment({ status = async () => {}, snapshot = async () => ({ scenes: [{ pageId: 1, destroyed: false, gameplay: { area: 1, expeditionActive: true } }] }) } = {}) {
  const calls = [], module = { exports: {} }, page = {};
  const expect = locator => ({ toHaveText: async (text, options) => {
    assert.equal(locator, '.game-status'); assert.equal(text, 'Expedition in progress. Return to town to save your result.');
    calls.push(['status', options.timeout]); await status();
  } });
  expect.poll = (read, options) => ({ toBe: async expected => { calls.push(['gameplay', options.timeout]); assert.equal(await read(), expected); } });
  vm.runInNewContext(callbackJS, { module, exports: module.exports, page, expect, screen: target => {
    assert.equal(target, page); return { locator: selector => selector };
  }, snapshot: async target => { assert.equal(target, page); calls.push(['snapshot']); return snapshot(); } });
  return { run: module.exports.acknowledge, calls };
}

test('actual native callback subtracts key delivery and status time from the gameplay assertion budget', async () => {
  const key = deferred(), status = deferred(), m = model({ down: () => key.promise }), a = acknowledgment({ status: () => status.promise });
  const result = outcome(m.run(a.run)); await m.advance(1000); key.resolve(); await flush();
  assert.deepEqual(a.calls, [['status', 14000]]);
  await m.advance(9000); status.resolve(); await flush();
  assert.deepEqual(a.calls, [['status', 14000], ['gameplay', 6000], ['snapshot']]);
  assert.deepEqual(await result, { passed: true }); assert.deepEqual(m.events.at(-1), ['up', 'e', 9000]);
});

for (const [name, scenes] of [
  ['town', [{ pageId: 1, destroyed: false, gameplay: { area: 0, expeditionActive: false } }]],
  ['inactive dungeon', [{ pageId: 1, destroyed: false, gameplay: { area: 1, expeditionActive: false } }]],
  ['wrong page', [{ pageId: 2, destroyed: false, gameplay: { area: 1, expeditionActive: true } }]],
  ['destroyed scene', [{ pageId: 1, destroyed: true, gameplay: { area: 1, expeditionActive: true } }]],
  ['missing scene', []]
]) test(`status text alone cannot acknowledge ${name}`, async () => {
  const m = model(), a = acknowledgment({ snapshot: async () => ({ scenes }) });
  assert.equal((await outcome(m.run(a.run))).passed, false); releasedOnce(m); downOnce(m);
});

test('late status success cannot launch the gameplay assertion after timeout cleanup', async () => {
  const status = deferred(), m = model(), a = acknowledgment({ status: () => status.promise });
  const result = outcome(m.run(a.run)); await flush(); await m.advance(15000); assert.equal((await result).passed, false);
  status.resolve(); await flush(); assert.deepEqual(a.calls, [['status', 15000]]); releasedOnce(m);
});

test('a late gameplay snapshot cannot convert the timeout to success or repeat E', async () => {
  const read = deferred(), m = model(), a = acknowledgment({ snapshot: () => read.promise });
  const result = outcome(m.run(a.run)); await flush(); await m.advance(15000); assert.equal((await result).passed, false);
  read.resolve({ scenes: [{ pageId: 1, destroyed: false, gameplay: { area: 1, expeditionActive: true } }] }); await flush();
  assert.deepEqual(a.calls, [['status', 15000], ['gameplay', 15000], ['snapshot']]); releasedOnce(m); downOnce(m);
});

// Exercise the unchanged full verifier, rather than claiming a text/state ack
// alone proves a new session. Fabricated receipts are not runtime evidence.
import { fabricateNativeCourtyard, reconcileFabricatedCopies, loadContract } from './courtyard-native-schema.mjs';
const { verifyCourtyardState } = await loadContract('verify-courtyard.mjs');
for (const index of [0, 1]) for (const [name, mutate] of [
  ['preexisting active expedition', f => { const gate = f.observation.state.checkpoints.find(p => p.label === 'gate-arrived'); gate.scene.gameplay.area = 1; gate.scene.gameplay.expeditionActive = true; }],
  ['preexisting session', f => { f.observation.state.checkpoints.find(p => p.label === 'gate-arrived').starts = 1; }],
  ['duplicate session-start request', f => { f.observation.state.api.push(structuredClone(f.observation.state.api.find(c => c.path === '/api/games/session/start'))); }],
  ['missing session-start request', f => { f.observation.state.api = f.observation.state.api.filter(c => c.path !== '/api/games/session/start'); }]
]) test(`unchanged strict ${index ? 'phone' : 'desktop'} verifier rejects ${name}`, () => {
  const f = fabricateNativeCourtyard(index); mutate(f); reconcileFabricatedCopies(f);
  assert.throws(() => verifyCourtyardState(f.observation, f.driver, index));
});

test('timed-out native operations can reject later without an unhandled rejection', async () => {
  const unhandled = [], record = error => unhandled.push(error);
  process.on('unhandledRejection', record);
  try {
    for (const stage of ['down', 'acknowledge']) {
      const pending = deferred(), m = model(stage === 'down' ? { down: () => pending.promise } : {});
      const result = outcome(m.run(() => stage === 'acknowledge' ? pending.promise : Promise.resolve()));
      await flush(); await m.advance(15000); assert.equal((await result).passed, false);
      pending.reject(Error(`late ${stage} rejection`)); await new Promise(setImmediate); await new Promise(setImmediate);
      downOnce(m); releasedOnce(m);
    }
    assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', record); }
});
