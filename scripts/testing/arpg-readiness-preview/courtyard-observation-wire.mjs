// Native report transport only. No evidence fields or semantic checks are removed.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { COURTYARD_TITLES } from './courtyard-contract.mjs';

export const NATIVE_OBSERVATION_WIRE = 'arpg-native-cleanup-sharing-v1';
export const NATIVE_OBSERVATION_LIMITS = Object.freeze({
  base64Chars: 30_000_000, wireBytes: 22_500_000, expandedBytes: 32_000_000,
  wireNodes: 2_000_000, expandedNodes: 3_000_000, tokens: 4_000_000, depth: 32, references: 2
});
const SHARED = Object.freeze(['checkpoints', 'visuals']);
const has = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const safeKey = key => assert(!['__proto__', 'constructor', 'prototype', '$ref'].includes(key), 'Forbidden native observation key');
const caseIndex = index => assert(Number.isInteger(index) && index >= 0 && index < COURTYARD_TITLES.length, 'Unknown native observation case');

// Bound traversal before stringify/clone. Count the full compact JSON, including
// every copied reference, rather than treating object identity as evidence.
function measure(value, maxBytes, maxNodes, normalize = false) {
  let bytes = 0, nodes = 0;
  const ancestors = new Set();
  const add = count => { bytes += count; assert(bytes <= maxBytes, 'Native observation expanded byte budget'); };
  function visit(v, depth) {
    // Root containers count as one, matching the pre-parse nesting guard.
    assert(depth + Number(v !== null && typeof v === 'object') <= NATIVE_OBSERVATION_LIMITS.depth, 'Native observation depth budget');
    assert(++nodes <= maxNodes, 'Native observation node budget');
    if (normalize && v === undefined) v = null;
    if (v === null || ['string', 'boolean', 'number'].includes(typeof v)) {
      assert(normalize || typeof v !== 'number' || (Number.isFinite(v) && !Object.is(v, -0)), 'Native observation must contain finite JSON numbers');
      add(Buffer.byteLength(JSON.stringify(v))); return;
    }
    assert((Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype) || record(v), 'Native observation must be plain JSON');
    assert(!has(v, 'toJSON') && Object.getOwnPropertySymbols(v).length === 0, 'Native observation cannot override JSON serialization');
    assert(!ancestors.has(v), 'Cyclic native observation'); ancestors.add(v); add(2);
    if (Array.isArray(v)) {
      assert(Object.keys(v).length === v.length, 'Native observation arrays must be dense without extra fields');
      for (let i = 0; i < v.length; i++) {
        assert(has(v, i) && has(Object.getOwnPropertyDescriptor(v, i), 'value'), 'Native observation arrays need plain dense entries');
        if (i) add(1); visit(v[i], depth + 1);
      }
    } else {
      let included = 0;
      for (const key of Object.keys(v)) {
        safeKey(key); assert(has(Object.getOwnPropertyDescriptor(v, key), 'value'), 'Native observation cannot contain getters');
        if (normalize && v[key] === undefined) continue;
        add(Buffer.byteLength(JSON.stringify(key)) + 1 + Number(included++ > 0)); visit(v[key], depth + 1);
      }
    }
    ancestors.delete(v);
  }
  visit(value, 0); return { bytes, nodes };
}

// Reject deep/token-heavy input before JSON.parse. Canonical JSON after removing
// insignificant whitespace also rejects duplicate definitions (including escaped
// duplicate keys), noncanonical numbers/escapes and invalid UTF-8 round trips.
function parseWire(text) {
  let depth = 0, tokens = 0, start = 0;
  const chunks = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (' \r\n\t'.includes(c)) {
      chunks.push(text.slice(start, i)); do { i++; } while (i < text.length && ' \r\n\t'.includes(text[i])); start = i; continue;
    }
    if (c === '"') {
      assert(++tokens <= NATIVE_OBSERVATION_LIMITS.tokens, 'Native observation token budget');
      i++; while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; continue;
    }
    if (c === '{' || c === '[') {
      assert(++depth <= NATIVE_OBSERVATION_LIMITS.depth, 'Native observation depth budget'); tokens++; i++;
    } else if (c === '}' || c === ']') { depth--; i++; }
    else if (c === ',' || c === ':') i++;
    else {
      tokens++; do { i++; } while (i < text.length && !' \r\n\t{}[],:"'.includes(text[i]));
    }
    assert(tokens <= NATIVE_OBSERVATION_LIMITS.tokens, 'Native observation token budget');
  }
  chunks.push(text.slice(start));
  const value = JSON.parse(text);
  measure(value, NATIVE_OBSERVATION_LIMITS.wireBytes, NATIVE_OBSERVATION_LIMITS.wireNodes);
  assert(JSON.stringify(value) === chunks.join(''), 'Native observation requires canonical JSON without duplicate definitions');
  return value;
}

export function serializeNativeObservation(observation, index) {
  caseIndex(index);
  measure(observation, NATIVE_OBSERVATION_LIMITS.expandedBytes, NATIVE_OBSERVATION_LIMITS.expandedNodes, true);
  // Match the original JSON.stringify treatment of optional undefined fields,
  // negative zero and nonfinite numbers before comparing serialized snapshots.
  observation = JSON.parse(JSON.stringify(observation));
  assert(record(observation) && !has(observation, 'schema'), 'Expected an unencoded native observation');
  const copy = { ...observation }, cleanupReferences = [];
  if (record(observation.state) && record(observation.afterCleanup)) {
    copy.afterCleanup = { ...observation.afterCleanup };
    for (const key of SHARED) {
      if (has(observation.state, key) && has(observation.afterCleanup, key) && Array.isArray(observation.state[key]) &&
          isDeepStrictEqual(observation.state[key], observation.afterCleanup[key])) {
        cleanupReferences.push(key); delete copy.afterCleanup[key];
      }
    }
  }
  // Unequal cleanup evidence stays inline so unchanged equality guards reject it.
  const envelope = { schema: NATIVE_OBSERVATION_WIRE, caseIndex: index, observation: copy, cleanupReferences };
  const size = measure(envelope, NATIVE_OBSERVATION_LIMITS.wireBytes, NATIVE_OBSERVATION_LIMITS.wireNodes);
  assert(4 * Math.ceil(size.bytes / 3) < NATIVE_OBSERVATION_LIMITS.base64Chars, 'Native observation attachment exceeds existing transport budget');
  return JSON.stringify(envelope);
}

export function serializeCourtyardOrLegacyObservation(observation, title) {
  const index = COURTYARD_TITLES.indexOf(title);
  return index < 0 ? JSON.stringify(observation, null, 2) : serializeNativeObservation(observation, index);
}

export function decodeNativeObservation(body, index) {
  caseIndex(index);
  assert(typeof body === 'string' && body.length < NATIVE_OBSERVATION_LIMITS.base64Chars, 'Native observation attachment exceeds existing transport budget');
  assert(body.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(body), 'Invalid native observation base64');
  const bytes = Buffer.from(body, 'base64');
  assert(bytes.length < NATIVE_OBSERVATION_LIMITS.wireBytes && bytes.toString('base64') === body, 'Invalid native observation encoding');
  const value = parseWire(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assert(record(value), 'Native observation must be an object');
  // Read existing reports without changing their semantic validation.
  if (!has(value, 'schema')) return value;
  assert.deepEqual(Object.keys(value).sort(), ['caseIndex', 'cleanupReferences', 'observation', 'schema']);
  assert.equal(value.schema, NATIVE_OBSERVATION_WIRE, 'Unknown native observation schema');
  assert.equal(value.caseIndex, index, 'Cross-case native observation reference');
  assert(record(value.observation) && !has(value.observation, 'schema'), 'Nested native observation envelope');
  const refs = value.cleanupReferences, observation = value.observation;
  assert(Array.isArray(refs) && refs.length <= NATIVE_OBSERVATION_LIMITS.references, 'Native observation reference budget');
  assert(refs.every(key => SHARED.includes(key)), 'Unknown native observation reference');
  assert.deepEqual(refs, SHARED.filter(key => refs.includes(key)), 'Duplicate or reordered native observation references');
  if (record(observation.state) && record(observation.afterCleanup)) {
    for (const key of SHARED) {
      assert(has(observation.state, key) && Array.isArray(observation.state[key]), 'Missing native reference source');
      assert(refs.includes(key) || (has(observation.afterCleanup, key) && Array.isArray(observation.afterCleanup[key])), 'Missing native cleanup reference or inline evidence');
    }
  }
  for (const key of refs) {
    assert(record(observation.state) && record(observation.afterCleanup), 'Missing native reference snapshots');
    assert(has(observation.state, key) && Array.isArray(observation.state[key]), 'Missing native reference source');
    assert(!has(observation.afterCleanup, key), 'Duplicate native reference target definition');
  }
  // References are exactly two enumerated same-case state -> cleanup edges,
  // depth one. No external lookup, arbitrary paths, chained references or cycles.
  const expanded = { ...observation, ...(refs.length ? { afterCleanup: { ...observation.afterCleanup } } : {}) };
  for (const key of refs) expanded.afterCleanup[key] = observation.state[key];
  measure(expanded, NATIVE_OBSERVATION_LIMITS.expandedBytes, NATIVE_OBSERVATION_LIMITS.expandedNodes);
  // Separate trees retain the original independent snapshot semantics.
  for (const key of refs) expanded.afterCleanup[key] = structuredClone(observation.state[key]);
  return expanded;
}
