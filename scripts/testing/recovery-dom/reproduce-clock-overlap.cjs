// Diagnostic only: compare explicitly chosen internal continuation orderings.
// This does not reproduce or establish Chromium's native timer-task ordering.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { resolve, dirname, join } = require('node:path');
const { createHash } = require('node:crypto');
const repository = resolve(process.argv[2] || process.cwd());
const playwrightPackage = require.resolve('playwright-core/package.json', { paths: [repository] });
const version = require(playwrightPackage).version;
assert.equal(version, '1.56.0', 'This experiment describes the locked clock engine');
const { source } = require(join(dirname(playwrightPackage), 'lib/generated/clockSource.js'));
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const context = { module: { exports: {} }, console };
vm.runInNewContext(source, context);
const ClockController = context.module.exports.ClockController();
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

async function observe(order) {
  const pending = [];
  const clock = new ClockController({
    dateNow: () => 0,
    performanceNow: () => 0,
    setTimeout: (callback, delay) => { pending.push({ callback, delay }); return () => {}; },
    setInterval: () => () => {}
  });
  clock.install(0);
  let frames = 0;
  const frame = () => {
    frames++;
    clock.addTimer({ type: 'AnimationFrame', func: frame, delay: 16 });
  };
  await clock.runFor(5000);
  clock.addTimer({ type: 'AnimationFrame', func: frame, delay: 0 });
  // Invoke the same internal drain used by the real-time callback, but replace
  // its native scheduling with an explicit adversarial/FIFO ordering below.
  const oldDrain = clock._runTo(clock.performanceNow());
  const oldYield = pending.shift();
  const jump = clock.fastForward(10050);
  const jumpYield = pending.shift();
  assert.equal(frames, 2);
  let afterJumpCompletion;
  if (order === 'fifo') {
    oldYield.callback(); await flush(); await oldDrain;
    jumpYield.callback(); await flush(); await jump;
    afterJumpCompletion = clock.performanceNow();
  } else {
    jumpYield.callback(); await flush(); await jump;
    afterJumpCompletion = clock.performanceNow();
    oldYield.callback(); await flush(); await oldDrain;
  }
  const afterBothDrains = clock.performanceNow();
  let completed = false;
  const advance = clock.runFor(100).then(() => { completed = true; });
  for (let step = 0; !completed && step < 100; step++) {
    pending.shift()?.callback();
    await flush();
  }
  assert(completed, 'Bounded controlled timer drain must finish');
  await advance;
  return { chosenContinuationOrder: order, afterJumpCompletion, afterBothDrains,
    after100ms: clock.performanceNow(), frames, nextFrameAt: clock._firstTimer().callAt };
}

(async () => {
  const fifo = await observe('fifo');
  const adversarial = await observe('later-jump-yield-before-earlier-old-yield');
  assert.equal(fifo.afterBothDrains, 15050);
  assert.equal(fifo.after100ms, 15150);
  assert(fifo.frames > 2);
  assert.equal(adversarial.afterJumpCompletion, 15050);
  assert.equal(adversarial.afterBothDrains, 5000);
  assert.equal(adversarial.after100ms, 5100);
  assert.equal(adversarial.frames, 2);
  assert.equal(adversarial.nextFrameAt, 15066);
  console.log(JSON.stringify({
    control: 'adversarial internal overlap experiment; not an application acceptance test',
    limitation: 'Continuation order is deliberately chosen. Browser-realizable native ordering and the exact hosted failure cause are not established by this control.',
    playwright: version, sourceSha256, fifo, adversarial
  }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
