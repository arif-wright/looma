import { beforeWestInnerSetup } from './courtyard-setup-preservation.mjs';
// Fabricated transport tests only. No browser execution or movement evidence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COURTYARD_TITLES } from './courtyard-contract.mjs';
import { TITLES } from './cases.mjs';
import { serializeNativeObservation, serializeCourtyardOrLegacyObservation, decodeNativeObservation, NATIVE_OBSERVATION_WIRE, NATIVE_OBSERVATION_LIMITS as LIMITS } from './courtyard-observation-wire.mjs';
const b64 = text => Buffer.from(text).toString('base64');
const body = value => b64(JSON.stringify(value));
const fixture = () => {
  const state = { checkpoints: [{ id: 1, allFields: { commands: [1, 2], flag: false, empty: null, text: 'é " \\ 😀' } }], visuals: [{ label: 'unmodified' }], motion: [0, 1] };
  return { browserVersion: 'FABRICATED', state, afterCleanup: { ...structuredClone(state), destroyed: true }, errors: [] };
};
const envelope = () => JSON.parse(serializeNativeObservation(fixture(), 0));
const reject = (name, mutate, message) => test(`wire rejects ${name}`, () => { const v = envelope(); mutate(v); assert.throws(() => decodeNativeObservation(body(v), 0), message); });
for (const index of [0, 1]) test(`lossless case ${index} restores every field and independent snapshot identity`, () => {
  const original = fixture(), before = structuredClone(original), wire = serializeNativeObservation(original, index), decoded = decodeNativeObservation(b64(wire), index);
  assert.deepEqual(decoded, original); assert.deepEqual(original, before);
  assert.deepEqual(JSON.parse(wire).cleanupReferences, ['checkpoints', 'visuals']);
  for (const key of ['checkpoints', 'visuals']) {
    assert.notEqual(decoded.afterCleanup[key], decoded.state[key]); assert.notEqual(decoded.afterCleanup[key][0], decoded.state[key][0]);
  }
  decoded.afterCleanup.checkpoints[0].allFields.commands.push(3); assert.equal(decoded.state.checkpoints[0].allFields.commands.length, 2);
});
for (const changed of [['checkpoints'], ['visuals'], ['checkpoints', 'visuals']]) test(`changed cleanup ${changed.join('/')} remains inline and exact`, () => {
  const original = fixture(); for (const key of changed) original.afterCleanup[key].push({ changed: true });
  const text = serializeNativeObservation(original, 0), v = JSON.parse(text);
  assert.deepEqual(v.cleanupReferences, ['checkpoints', 'visuals'].filter(key => !changed.includes(key)));
  assert.deepEqual(decodeNativeObservation(b64(text), 0), original);
});
test('null teardown failure snapshots remain unchanged for semantic rejection', () => {
  const original = { state: null, afterCleanup: null, cleanupErrors: ['original failure'] };
  assert.deepEqual(decodeNativeObservation(b64(serializeNativeObservation(original, 0)), 0), original);
});
test('legacy observation JSON remains readable within the unchanged cap', () => assert.deepEqual(decodeNativeObservation(b64(JSON.stringify(fixture(), null, 2)), 0), fixture()));
test('only exact native titles select the envelope; all other titles keep original bytes', () => {
  const value = { ...fixture(), omission: undefined, minusZero: -0, nonfinite: NaN };
  const other = [...TITLES, '', 'controlled-courtyard-visual', 'walk-frame', ...COURTYARD_TITLES.flatMap(t => [`${t} `, `prefix ${t}`, t.toUpperCase()])];
  for (const title of other) assert.equal(serializeCourtyardOrLegacyObservation(value, title), JSON.stringify(value, null, 2));
  for (const [index, title] of COURTYARD_TITLES.entries()) assert.equal(JSON.parse(serializeCourtyardOrLegacyObservation(fixture(), title)).caseIndex, index);
});
for (const [name, mutate, message] of [
  ['unknown schema', v => v.schema += '-unknown', /schema/],
  ['extra envelope member', v => v.extra = true],
  ['missing reference list', v => delete v.cleanupReferences],
  ['nonarray references', v => v.cleanupReferences = {}],
  ['too many references', v => v.cleanupReferences.push('checkpoints'), /reference budget/],
  ['duplicate references', v => v.cleanupReferences = ['checkpoints', 'checkpoints'], /Duplicate/],
  ['reordered references', v => v.cleanupReferences.reverse(), /reordered/],
  ['unknown reference', v => v.cleanupReferences[0] = 'plazaMotion', /Unknown/],
  ['arbitrary source path', v => v.cleanupReferences[0] = 'state.checkpoints', /Unknown/],
  ['cross-case source path', v => v.cleanupReferences[0] = 'cases[1].state.checkpoints', /Unknown/],
  ['cross-case envelope', v => v.caseIndex = 1, /Cross-case/],
  ['noninteger case', v => v.caseIndex = 0.5, /Cross-case/],
  ['missing source', v => delete v.observation.state.checkpoints, /Missing/],
  ['nonarray source', v => v.observation.state.checkpoints = {}, /Missing/],
  ['missing source snapshot', v => v.observation.state = null, /Missing/],
  ['missing target snapshot', v => v.observation.afterCleanup = null, /Missing/],
  ['duplicate target definition', v => v.observation.afterCleanup.checkpoints = [], /Duplicate/],
  ['missing reference and inline evidence', v => v.cleanupReferences.pop(), /Missing/],
  ['nested envelope', v => v.observation.schema = NATIVE_OBSERVATION_WIRE, /Nested/],
  ['nested reference marker', v => v.observation.state.checkpoints[0] = { $ref: 'afterCleanup.checkpoints' }, /Forbidden/],
  ['prototype key', v => v.observation.state.checkpoints[0] = JSON.parse('{"__proto__":{}}'), /Forbidden/],
  ['constructor key', v => v.observation.state.checkpoints[0] = { constructor: {} }, /Forbidden/],
  ['prototype path', v => v.cleanupReferences[0] = '__proto__', /Unknown/]
]) reject(name, mutate, message);
for (const text of [
  '{"schema":"arpg-native-cleanup-sharing-v1","schema":"arpg-native-cleanup-sharing-v1"}',
  '{"state":{"checkpoints":[],"checkpoints":[]}}', '{"state":{"checkpoints":[],"checkpoin\\u0074s":[]}}',
  '{"state":{"n":1e400}}', '{"x":0,}', '{"x":"unterminated}', 'null', '[]'
]) test(`reject malformed or duplicate JSON ${text.slice(0, 55)}`, () => assert.throws(() => decodeNativeObservation(b64(text), 0)));
test('reject malformed base64 and UTF-8 before reconstruction', () => {
  for (const v of ['???=', 'e30', 'e31=', 'e30=\n', '/w==']) assert.throws(() => decodeNativeObservation(v, 0));
});
test('reject encoded input at original strict 30M boundary', () => {
  assert.equal(LIMITS.base64Chars, 30_000_000);
  assert.throws(() => decodeNativeObservation('A'.repeat(30_000_000), 0), /transport budget/);
});
test('reject excessive nesting before parse and excessive source cycles before serialization', () => {
  assert.throws(() => decodeNativeObservation(b64('['.repeat(33) + '0' + ']'.repeat(33)), 0), /depth budget/);
  const v = fixture(); v.state.loop = v; assert.throws(() => serializeNativeObservation(v, 0), /Cyclic/);
});
test('reject decoded node expansion before cloning references', () => {
  const v = envelope(); v.observation.state.checkpoints = Array(1_500_000).fill(0);
  assert.throws(() => decodeNativeObservation(body(v), 0), /node budget/);
});
test('reject excessive decoded wire nodes even without reference expansion', () => {
  const v = fixture(); v.extra = Array(2_000_000).fill(0);
  assert.throws(() => decodeNativeObservation(body(v), 0), /node budget/);
});
test('reject reconstructed byte expansion before cloning references', () => {
  const v = envelope(); v.observation.state.checkpoints = ['x'.repeat(16_000_000)];
  assert.throws(() => decodeNativeObservation(body(v), 0), /expanded byte budget/);
});
test('serializer rejects oversized inline data without raising transport cap', () => {
  const v = fixture(); v.extra = 'x'.repeat(22_500_000);
  assert.throws(() => serializeNativeObservation(v, 0), /byte budget|transport budget/);
});
test('historical semantic movement/state and controlled verifiers retain exact original bytes outside the explicit setup delta', () => {
  const preserved = {
    'verify-courtyard.mjs': 'fac548f0a2d3b433f4959308217a3d71f075ad178cf111a5736e1545bab21e41', 'visual-verifier.mjs': 'de779e1820657bf9dae9131e137f61030e58cf40743d311aefdc71ab5877bafa',
    'verify-results.mjs': 'b2b3c3b782c23d9fd4b18732c76a026a1411a2f3760c11fb0dbf6aeddab943b1', 'walk-frame-verifier.mjs': '71dcbb1a3f7a90be3b147190d191095c4d7f0ddd320104cdbe903ac41c7695db'
  };
  for (const [name, hash] of Object.entries(preserved)) assert.equal(createHash('sha256').update(beforeWestInnerSetup(name,readFileSync(new URL(name, import.meta.url),'utf8'))).digest('hex'), hash, name);
});

test('native producer retains the original JSON normalization of optional fields and numbers',()=>{
 const original=fixture();original.optional=undefined;original.minusZero=-0;original.nonfinite=NaN;original.state.checkpoints[0].optional=undefined;
 original.afterCleanup.checkpoints[0].optional=undefined;
 assert.deepEqual(decodeNativeObservation(b64(serializeNativeObservation(original,0)),0),JSON.parse(JSON.stringify(original)));
});
test('producer rejects accessors and serializer overrides without invoking them',()=>{
 for(const array of [false,true]){const v=fixture(),target=array?v.state.checkpoints:v.state;let calls=0;
  Object.defineProperty(target,array?'0':'trap',{enumerable:true,get(){calls++;return [];}});
  assert.throws(()=>serializeNativeObservation(v,0));assert.equal(calls,0);
 }
 const v=fixture();let calls=0;Object.defineProperty(v.state,'toJSON',{value(){calls++;return {};}});
 assert.throws(()=>serializeNativeObservation(v,0));assert.equal(calls,0);
});

function nestedValue(containers, leaf) {
 let value=leaf;for(let i=0;i<containers;i++)value={next:value};return value;
}
for(const leaf of [null, {}, []])test(`producer and decoder agree at the exact container-depth limit with ${JSON.stringify(leaf)} leaf`,()=>{
 // The envelope itself consumes one of the 32 container levels. Empty object
 // and array leaves consume a level; a primitive leaf does not.
 const leafContainers=leaf!==null&&typeof leaf==='object'?1:0;
 const maxObservationWrappers=LIMITS.depth-1-leafContainers;
 for(const wrappers of [maxObservationWrappers-1,maxObservationWrappers]){
  const original=nestedValue(wrappers,leaf),text=serializeNativeObservation(original,0);
  assert.deepEqual(decodeNativeObservation(b64(text),0),original);
 }
 assert.throws(()=>serializeNativeObservation(nestedValue(maxObservationWrappers+1,leaf),0),/depth budget/);
 const tooDeep={schema:NATIVE_OBSERVATION_WIRE,caseIndex:0,observation:nestedValue(maxObservationWrappers+1,leaf),cleanupReferences:[]};
 assert.throws(()=>decodeNativeObservation(body(tooDeep),0),/depth budget/);
});
test('legacy decoder accepts 32 containers and rejects 33 without envelope overhead',()=>{
 const exact=nestedValue(LIMITS.depth,null);assert.deepEqual(decodeNativeObservation(body(exact),0),exact);
 assert.throws(()=>decodeNativeObservation(body(nestedValue(LIMITS.depth+1,null)),0),/depth budget/);
});
