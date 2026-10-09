import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [mode, filename = 'artifacts/moonberry-gather/results.json', focusedProject] = process.argv.slice(2);
const focusedProjects = ['three-desktop', 'three-medium-landscape', 'three-landscape'];
if (mode === 'focused') assert(focusedProjects.includes(focusedProject), 'Expected an explicitly reviewed focused viewport');
const projects = mode === 'stress' ? ['three-medium-landscape', 'three-landscape']
  : mode === 'comparison' ? ['three-medium-landscape']
  : mode === 'focused' ? [focusedProject]
  : mode === 'preflight' ? focusedProjects : null;
assert(projects, 'Expected stress, comparison, focused or preflight mode');
const repeats = mode === 'preflight' ? 1 : 3;
const report = JSON.parse(readFileSync(filename, 'utf8'));
const tests = [];
function visit(suite) {
  for (const spec of suite.specs ?? []) {
    assert.equal(spec.title, 'Three feedback, gather and independent movement/camera targets never overlap');
    assert.equal(spec.ok, true);
    tests.push(...spec.tests);
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites) visit(suite);
assert.equal(tests.length, projects.length * repeats);
for (const project of projects) assert.equal(tests.filter(test => test.projectName === project).length, repeats);
for (const test of tests) {
  assert.equal(test.expectedStatus, 'passed');
  assert.equal(test.status, 'expected');
  assert.equal(test.results.length, 1);
  const result = test.results[0];
  assert.equal(result.status, 'passed');
  const evidence = name => {
    const attachment = result.attachments.find(item => item.name === name);
    assert(attachment?.path, `Every repetition must preserve ${name}`);
    return JSON.parse(readFileSync(attachment.path, 'utf8'));
  };
  const inputMode = evidence('touch-input-mode');
  const expectsTouch = test.projectName !== 'three-desktop';
  assert.equal(inputMode.declaredTouch, expectsTouch);
  assert.equal(inputMode.upVisible, expectsTouch);
  assert.equal(inputMode.maxTouchPoints > 0, expectsTouch);
  assert.equal(inputMode.coarsePointer, expectsTouch);
  if (test.projectName === 'three-desktop') {
    assert(!result.attachments.some(item => item.name === 'touch-movement-diagnostics'),
      'Desktop has no touch controls; it must retain the declared non-touch mode');
  } else {
    const input = evidence('touch-movement-diagnostics');
    assert.equal(input.inputPassed, true);
    // Native RAF can process a real press before the post-active snapshot runs.
    assert(Number(input.drivenFrames.canvas.frame) > Number(input.beforeInput.canvas.frame),
      'The actual renderer must advance after the pre-input snapshot');
  }
  const secondGather = evidence('second-gather-diagnostics');
  assert.equal(secondGather.countAfter, secondGather.countBefore + 1);
  assert.equal(typeof secondGather.requestId, 'string');
  assert(secondGather.requestId.length > 0);
  assert.notEqual(secondGather.requestId, secondGather.previousRequestId);
  assert.equal(secondGather.successObserved, true);
  const deadline = evidence('gather-deadline-diagnostics');
  assert.equal(deadline.clock, 'native');
  assert(deadline.after.performance - deadline.before.performance >= 10_000,
    'The unchanged 10-second production gather deadline must elapse naturally');
}
assert.equal(report.errors.length, 0);
assert.equal(report.stats.unexpected, 0);
assert.equal(report.stats.skipped, 0);
assert.equal(report.stats.flaky, 0);
console.log(`Verified ${tests.length} native-clock layout cases, required touch input/frame evidence, and real 10-second deadlines; no skips or retries.`);
