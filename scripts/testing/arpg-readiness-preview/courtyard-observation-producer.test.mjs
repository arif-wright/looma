// Exact shared producer-expression checks, with fabricated inputs only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { COURTYARD_TITLES } from './courtyard-contract.mjs';
import { TITLES } from './cases.mjs';
import { VISUAL_TITLES } from './visual-contract.mjs';
import { WALK_TITLES } from './walk-frame-contract.mjs';
import { serializeCourtyardOrLegacyObservation, decodeNativeObservation } from './courtyard-observation-wire.mjs';
const ts = createRequire(import.meta.url)('typescript');
const source = readFileSync(new URL('./guard.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('guard.ts', source, ts.ScriptTarget.Latest, true), bodies = [];
function visit(n) {
  if (ts.isCallExpression(n) && n.expression.getText(ast) === 'info.attach' && n.arguments[0]?.text === 'arpg-real-engine-observations') {
    bodies.push(n.arguments[1].properties.find(p => p.name?.getText(ast) === 'body').initializer.getText(ast));
  }
  ts.forEachChild(n, visit);
}
visit(ast); assert.equal(bodies.length, 1);
const invoke = new Function('browser', 'state', 'afterCleanup', 'blocked', 'errors', 'consoleErrors', 'unexpectedConsoleErrors', 'cleanupErrors', 'info', 'serializeCourtyardOrLegacyObservation', `return ${bodies[0]};`);
const snapshot = { checkpoints: [{ optional: undefined, negativeZero: -0, empty: null }], visuals: [{ text: 'actual guard field path' }], optional: undefined, nonfinite: NaN };
const original = { browserVersion: '143.0.7499.4', state: snapshot, afterCleanup: { ...structuredClone(snapshot), destroyed: true }, blocked: [], errors: [], consoleErrors: [], unexpectedConsoleErrors: [], cleanupErrors: [] };
const produce = title => invoke({ version: () => original.browserVersion }, original.state, original.afterCleanup, [], [], [], [], [], { title }, serializeCourtyardOrLegacyObservation);
for (const [index, title] of COURTYARD_TITLES.entries()) test(`real guard attachment expression preserves prior native JSON value: ${index}`, () => {
  assert.deepEqual(decodeNativeObservation(Buffer.from(produce(title)).toString('base64'), index), JSON.parse(JSON.stringify(original, null, 2)));
});
for (const title of [...TITLES, ...VISUAL_TITLES, ...WALK_TITLES, 'ARPG stationary frame gap: diagnostic only, never acceptance', 'ARPG prompt timing: diagnostic only, never acceptance']) {
  test(`real guard preserves exact legacy attachment bytes: ${title}`, () => assert.equal(produce(title), JSON.stringify(original, null, 2)));
}
test('guard change is exactly the serialization import and body hook; all cleanup/isolation assertions remain byte-identical', () => {
  const preimage = source.replace("import { serializeCourtyardOrLegacyObservation } from './courtyard-observation-wire.mjs';\n", '')
    .replace('body: serializeCourtyardOrLegacyObservation({ browserVersion:', 'body: JSON.stringify({ browserVersion:')
    .replace('consoleErrors, unexpectedConsoleErrors, cleanupErrors }, info.title)', 'consoleErrors, unexpectedConsoleErrors, cleanupErrors }, null, 2)');
  assert.equal(createHash('sha256').update(preimage).digest('hex'), '9257875b2fafd1d23b60f890d8e872a4c6228366a57d72d7493153da7d5b423a');
  assert.deepEqual(ts.transpileModule(source, { fileName: 'guard.ts', compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true }).diagnostics, []);
});
