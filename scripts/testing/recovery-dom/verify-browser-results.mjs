import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const requiredProjects = ['phaser-desktop', 'phaser-narrow', 'three-desktop', 'three-narrow', 'phaser-landscape'];
const tests = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    assert(spec.ok, `Portal browser case failed: ${spec.title}`);
    for (const test of spec.tests) tests.push(test);
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
assert.equal(tests.length, 80, 'All 16 real-renderer cases must run in all five portal viewport projects');
for (const project of requiredProjects) {
  assert.equal(tests.filter(test => test.projectName === project).length, 16, project);
}
for (const test of tests) {
  assert(requiredProjects.includes(test.projectName));
  assert.equal(test.status, 'expected');
  assert.equal(test.expectedStatus, 'passed');
  assert.equal(test.results.length, 1, 'No retries may substitute for a clean portal pass');
  assert.equal(test.results[0].status, 'passed');
}
assert.equal(report.stats.unexpected, 0);
assert.equal(report.stats.skipped, 0);
assert.equal(report.stats.flaky, 0);
console.log('Verified 80 real-browser portal recovery cases across both renderers and five viewports.');
