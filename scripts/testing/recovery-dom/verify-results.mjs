import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [kind, filename] = process.argv.slice(2);
const expected = { neon: 3, portal: 52 }[kind];
assert(expected, 'Expected neon or portal report');
const report = JSON.parse(readFileSync(filename, 'utf8'));
assert.equal(report.success, true, `${kind}: test process must succeed`);
assert.equal(report.numTotalTests, expected, `${kind}: all recovery cases must be discovered`);
assert.equal(report.numPassedTests, expected, `${kind}: every recovery case must pass`);
assert.equal(report.numFailedTests, 0);
assert.equal(report.numPendingTests, 0);
assert.equal(report.numTodoTests, 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, expected);
assert(assertions.every(result => result.status === 'passed'), `${kind}: no skipped assertions`);
console.log(`Verified ${expected} passing ${kind} DOM recovery cases; none skipped.`);
