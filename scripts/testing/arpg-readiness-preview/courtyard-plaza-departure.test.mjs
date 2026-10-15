import { beforePlazaDeparture } from './plaza-departure-preservation.mjs';
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

const driver = read('./plaza-browser.ts');
const ast = ts.createSourceFile('plaza-browser.ts', driver, ts.ScriptTarget.Latest, true);
let departure;
const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'departCourtyard') { assert.equal(departure, undefined); departure = node; } ts.forEachChild(node, visit); };
visit(ast);
const callback = departure.arguments[1];
const guard = ts.createSourceFile('guard.ts', read('./guard.ts'), ts.ScriptTarget.Latest, true);
const expedition = guard.statements.flatMap(s => ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []).find(d => d.name.getText(guard) === 'expedition').initializer;
const normalize = text => text.replace(/\s+/g, '');

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


test('readiness driver changes only the approved departure import/call; all shared primitives and routes remain literal',()=>{
  assert.equal(createHash('sha256').update(beforePlazaDeparture(driver)).digest('hex'),'cf3565826545746b4087f76102b4f58f8f08f8a957f9d0ffaf6b06321ae9dcac');
  const enclosing=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='runPlazaExploration');
  assert(departure.pos>=enclosing.pos&&departure.end<=enclosing.end);
  assert.equal((driver.match(/departCourtyard\(page/g)||[]).length,1);
  assert.equal(departure.arguments[0].getText(ast),'page');
});
test('helper change is comment-only: full original bytes and emitted JavaScript remain independently pinned',()=>{
  const original=source.replace('// Native exploration departure:','// Native courtyard only:');
  assert.equal(createHash('sha256').update(original).digest('hex'),'5c733534948ce620b4018307aea19ac842c7d7c55b837441b69a81dba6ee5101');
  const emitted=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,removeComments:true}}).outputText;
  assert.equal(emitted(source),emitted(original));
  assert.equal((source.match(/page\.keyboard\.down\('e'\)/g)||[]).length,1);
  assert.equal((source.match(/page\.keyboard\.up\('e'\)/g)||[]).length,1);
  assert.doesNotMatch(source,/keyboard\.press|dispatchEvent|evaluate\(|fetch\(|setInterval|\.launch\(/);
});
test('readiness acknowledgment retains both expedition predicates with one remaining budget',()=>{
  const actual=callback.body.getText(ast).replace(/\s*remaining\(\);/g,'').replace(/, \{ timeout: remaining\(\) \}/g,'');
  const original=expedition.body.getText(guard).replace('screen(page, id)','screen(page)').replace('scene.pageId === id','scene.pageId === 1');
  assert.equal(normalize(actual),normalize(original));
  assert.equal((callback.body.getText(ast).match(/timeout: remaining\(\)/g)||[]).length,2);
  assert.equal((callback.body.getText(ast).match(/remaining\(\);/g)||[]).length,2);
  const other=ts.createSourceFile('courtyard-browser.ts',read('./courtyard-browser.ts'),ts.ScriptTarget.Latest,true);let found;
  const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(other)==='departCourtyard')found=n.arguments[1];ts.forEachChild(n,visit);};visit(other);
  assert.equal(normalize(callback.getText(ast)),normalize(found.getText(other)));
});
test('actual readiness callback spends the same 15000ms across delivery, status and scene read',async()=>{
  const key=deferred(),status=deferred(),scene=deferred(),m=model({down:()=>key.promise}),a=acknowledgment({status:()=>status.promise,snapshot:()=>scene.promise});
  const result=outcome(m.run(a.run));await m.advance(1000);key.resolve();await flush();assert.deepEqual(a.calls,[['status',14000]]);
  await m.advance(9000);status.resolve();await flush();assert.deepEqual(a.calls,[['status',14000],['gameplay',6000],['snapshot']]);
  await m.advance(14999);scene.resolve({scenes:[{pageId:1,destroyed:false,gameplay:{area:1,expeditionActive:true}}]});await flush();
  assert.deepEqual(await result,{passed:true});assert.deepEqual(m.events,[['down','e',0],['up','e',14999]]);assert.equal(m.timers.size,0);
});
for(const stage of ['delivery','status','scene'])for(const late of ['resolve','reject'])test(`readiness ${stage} timeout releases once and late ${late} cannot advance`,async()=>{
  const pending=deferred(),m=model(stage==='delivery'?{down:()=>pending.promise}:{}),a=acknowledgment({status:stage==='status'?()=>pending.promise:undefined,snapshot:stage==='scene'?()=>pending.promise:undefined});
  const result=outcome(m.run(a.run));await flush();await m.advance(15000);assert.equal((await result).passed,false);assert.deepEqual(m.events,[['down','e',0],['up','e',15000]]);
  const calls=structuredClone(a.calls);pending[late](late==='reject'?Error('late'):stage==='scene'?{scenes:[{pageId:1,destroyed:false,gameplay:{area:1,expeditionActive:true}}]}:undefined);await flush();await m.advance(30000);
  assert.deepEqual(a.calls,calls);downOnce(m);releasedOnce(m);assert.equal(m.timers.size,0);
});
for(const stage of ['delivery','status','scene'])for(const kind of ['synchronous','asynchronous'])test(`${kind} readiness ${stage} failure preserves error and releases once`,async()=>{
  const error=Error(stage),fail=()=>{if(kind==='synchronous')throw error;return Promise.reject(error);};
  const m=model(stage==='delivery'?{down:fail}:{}),a=acknowledgment({status:stage==='status'?fail:undefined,snapshot:stage==='scene'?fail:undefined});
  const result=await outcome(m.run(a.run));assert.equal(result.error,error);releasedOnce(m);downOnce(m);assert.equal(m.timers.size,0);
});
for(const [name,scenes] of [
  ['town',[{pageId:1,destroyed:false,gameplay:{area:0,expeditionActive:false}}]],
  ['inactive dungeon',[{pageId:1,destroyed:false,gameplay:{area:1,expeditionActive:false}}]],
  ['wrong page',[{pageId:2,destroyed:false,gameplay:{area:1,expeditionActive:true}}]],
  ['destroyed scene',[{pageId:1,destroyed:true,gameplay:{area:1,expeditionActive:true}}]],['missing scene',[]]
])test(`readiness status alone cannot acknowledge ${name}`,async()=>{
  const m=model(),a=acknowledgment({snapshot:async()=>({scenes})});assert.equal((await outcome(m.run(a.run))).passed,false);releasedOnce(m);downOnce(m);
});
test('readiness scene completing exactly at deadline fails even before its timer runs',async()=>{
  const m=model(),a=acknowledgment({snapshot:async()=>{m.jump(15000);return{scenes:[{pageId:1,destroyed:false,gameplay:{area:1,expeditionActive:true}}]};}});
  assert.match((await outcome(m.run(a.run))).error.message,/15000ms/);releasedOnce(m);downOnce(m);
});
for(const failed of [false,true])test(`readiness release failure remains visible with prior failure=${failed}`,async()=>{
  const releaseError=Error('up failed'),statusError=Error('status failed'),m=model({up:()=>{throw releaseError;}}),a=acknowledgment({status:async()=>{if(failed)throw statusError;}});
  const result=await outcome(m.run(a.run));if(failed)assert.deepEqual(result.error.errors,[statusError,releaseError]);else assert.equal(result.error,releaseError);downOnce(m);releasedOnce(m);
});
// Reuse the unchanged existing fabricated report factory by extracting its real
// declaration. Do not import that test file or emit fabricated runtime evidence.
import {fabricateCourtyardSchema} from './courtyard-schema-data.mjs';
import {fabricatePlazaSchema} from './schema-plaza-data.mjs';
import {expectedBackdropCommands} from './town-ground.mjs';
import {PLAZA_KEYS} from './plaza-contract.mjs';
import {TITLES} from './cases.mjs';
import {EXPECTED_STARTS,verifyObservation} from './verify-observations.mjs';
import {EXPECTED_REWARD_MUTATIONS,expectedStart,FLOW_CAP_MS,SIGNATURE} from './protocol.mjs';
import {DESKTOP_TOWN_SCREENSHOT,PHONE_TOWN_SCREENSHOT,requiredScreenshots} from './screenshots.mjs';
const factoryAST=ts.createSourceFile('verify-results.test.mjs',read('./verify-results.test.mjs'),ts.ScriptTarget.Latest,true),factory=factoryAST.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='report');
const bindings={TITLES,PLAZA_KEYS,expectedBackdropCommands,fabricateCourtyardSchema,EXPECTED_STARTS,expectedStart,FLOW_CAP_MS,SIGNATURE,DESKTOP_TOWN_SCREENSHOT,PHONE_TOWN_SCREENSHOT,fabricatePlazaSchema,EXPECTED_REWARD_MUTATIONS,requiredScreenshots,FILE:'readiness.browser.spec.ts',PROJECT:'chromium-arpg-readiness',image:'FABRICATED-NOT-PIXEL-EVIDENCE'};
const fabricated=new Function(...Object.keys(bindings),`return (${factory.getText(factoryAST)})();`)(...Object.values(bindings));
const receipt=index=>JSON.parse(Buffer.from(fabricated.suites[0].specs[index].tests[0].results[0].attachments[0].body,'base64'));
for(const index of [12,13]){
  test(`unchanged fabricated readiness ${index} full receipt passes, never native proof`,()=>verifyObservation(receipt(index),index));
  for(const [name,mutate] of [
    ['duplicate start',s=>s.api.push(structuredClone(s.api.find(c=>c.path==='/api/games/session/start')))],
    ['missing start',s=>s.api=s.api.filter(c=>c.path!=='/api/games/session/start')],
    ['preexisting session',s=>s.checkpoints.find(p=>p.label==='gate-arrived').starts=1],
    ['premature start',s=>s.api.find(c=>c.path==='/api/games/session/start').at=1],
    ['duplicate sign',s=>s.api.push(structuredClone(s.api.find(c=>c.path==='/api/games/sign')))],
    ['duplicate completion',s=>s.api.push(structuredClone(s.api.find(c=>c.path==='/api/games/session/complete')))],
    ['wrong signed body',s=>s.api.find(c=>c.path==='/api/games/sign').body.score=1],
    ['wrong reward',s=>s.rewardMutations[0].value.xpDelta=999]
  ])test(`unchanged strict readiness ${index} verifier rejects ${name}`,()=>{
    const f=receipt(index);mutate(f.state);for(const k of ['api','checkpoints','visuals','rewardMutations'])f.afterCleanup[k]=structuredClone(f.state[k]);assert.throws(()=>verifyObservation(f,index));
  });
}
test('both existing courtyard jobs select this readiness regression file through their unchanged wildcard',()=>{
  assert(new URL(import.meta.url).pathname.endsWith('/courtyard-plaza-departure.test.mjs'));
  for(const job of ['arpg-courtyard-native.yml','arpg-courtyard-controlled.yml']){
    const workflow=readFileSync(new URL(`../../../.github/workflows/${job}`,import.meta.url),'utf8');
    assert.match(workflow,/node --test[^\n]*scripts\/testing\/arpg-readiness-preview\/courtyard-\*\.test\.mjs/);
  }
});
