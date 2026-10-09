// Historical filename retained for the release workflow. This now verifies the
// fixed, exactly pinned Playwright engine; it does not expect clock rollback.
// These are Node/controlled-embedder checks, not Chromium or application tests.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { resolve, dirname, join } = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const repository = resolve(process.argv[2] || process.cwd());
const playwrightPackage = require.resolve('playwright-core/package.json', { paths: [repository] });
const version = require(playwrightPackage).version;
assert.equal(version, '1.57.0', 'This regression control requires the reviewed fixed release');
const { source } = require(join(dirname(playwrightPackage), 'lib/generated/clockSource.js'));
const sourceSha256 = createHash('sha256').update(source).digest('hex');
assert.equal(sourceSha256, '63667c8dd444db30b2d6d84f4954d74510df526b5bf1215929830f7b3cb66949',
  'The installed clock engine must match the reviewed Playwright 1.57.0 artifact');
const context = { module: { exports: {} }, console };
vm.runInNewContext(source, context);
const ClockController = context.module.exports.ClockController();

// A native event-loop turn lets every queued Promise continuation finish, but
// cannot execute the controlled embedder's explicitly held timer callbacks.
const microtaskCheckpoint = () => new Promise(resolve => setImmediate(resolve));
const finite = (number, label) => assert(Number.isFinite(number), `${label} must be finite`);
const monotonic = (values, label) => {
  values.forEach((value, index) => {
    finite(value, `${label}[${index}]`);
    if (index) assert(value >= values[index - 1], `${label} must not move backwards`);
  });
};

function controlledClock() {
  let nativeTime = 0;
  const pending = [];
  const clock = new ClockController({
    dateNow: () => nativeTime,
    performanceNow: () => nativeTime,
    setTimeout: (callback, delay = 0) => {
      const task = { callback, delay, cancelled: false };
      pending.push(task);
      return () => { task.cancelled = true; };
    },
    setInterval: () => { throw new Error('Unexpected native interval in the controlled engine'); }
  });
  clock.install(0);
  const runNext = () => {
    while (pending.length) {
      const task = pending.shift();
      if (task.cancelled) continue;
      task.callback();
      return true;
    }
    return false;
  };
  // A small finite operation has a strict continuation bound. This catches a
  // deadlock instead of waiting forever or advancing time until an assertion passes.
  const drain = async promise => {
    let completed = false;
    let failure;
    Promise.resolve(promise).then(() => { completed = true; }, error => {
      completed = true;
      failure = error;
    });
    for (let step = 0; step < 64 && !completed; step++) {
      await microtaskCheckpoint();
      if (!completed) assert(runNext(), 'An unfinished controlled operation needs a queued continuation');
    }
    await microtaskCheckpoint();
    assert(completed, 'Controlled operation exceeded its finite continuation budget');
    if (failure) throw failure;
    return { completed, time: clock.performanceNow() };
  };
  return { clock, runNext, drain, setNativeTime: time => { nativeTime = time; } };
}

async function serialization(method) {
  const scheduler = controlledClock();
  const { clock } = scheduler;
  const callbacks = [];
  for (let index = 0; index < 2; index++) {
    clock.addTimer({ type: 'Timeout', func: () => callbacks.push(clock.now()), delay: 10 });
  }
  clock.resume();
  scheduler.setNativeTime(10);
  assert(scheduler.runNext(), 'Automatic synchronization must have been scheduled');
  assert.deepEqual(callbacks, [10], 'The first callback starts the automatic drain');

  let advanceCompleted = false;
  const advance = clock[method](1000).then(() => { advanceCompleted = true; });
  await microtaskCheckpoint();
  const whileAutomaticDrainHeld = { callbacks: callbacks.slice(), time: clock.now(), advanceCompleted };
  assert.deepEqual(whileAutomaticDrainHeld, { callbacks: [10], time: 10, advanceCompleted: false },
    'Manual advancement must await the in-progress automatic drain');

  const completion = await scheduler.drain(advance);
  assert.deepEqual(callbacks, [10, 10], 'The automatic drain completes before manual time advancement');
  assert.equal(completion.time, 1010);
  assert.equal(advanceCompleted, true);
  monotonic([...callbacks, completion.time], `${method} timestamps`);
  await scheduler.drain(clock.pauseAt(clock.now()));
  return { method, whileAutomaticDrainHeld, callbacks, completion, activeDrainAwaited: true };
}

async function timerAndFrameContinuation() {
  const scheduler = controlledClock();
  const { clock } = scheduler;
  const frames = [];
  const timers = [];
  const frame = timestamp => {
    frames.push(timestamp);
    clock.addTimer({ type: 'AnimationFrame', func: frame, delay: clock.getTimeToNextFrame() });
  };
  clock.addTimer({ type: 'AnimationFrame', func: frame, delay: clock.getTimeToNextFrame() });
  clock.addTimer({ type: 'Timeout', func: () => timers.push(clock.now()), delay: 1000 });

  const jump = await scheduler.drain(clock.fastForward(1000));
  assert.equal(jump.time, 1000);
  assert.deepEqual(frames, [1000], 'A jump fires the already-due frame once');
  assert.deepEqual(timers, [1000], 'The due one-shot timer fires once');
  const continued = await scheduler.drain(clock.runFor(32));
  assert.equal(continued.time, 1032);
  assert.deepEqual(frames, [1000, 1008, 1024], 'New animation frames continue after the jump');
  clock.addTimer({ type: 'Timeout', func: () => timers.push(clock.now()), delay: 10 });
  const final = await scheduler.drain(clock.runFor(16));
  assert.equal(final.time, 1048);
  assert.deepEqual(frames, [1000, 1008, 1024, 1040]);
  assert.deepEqual(timers, [1000, 1042], 'A timer installed after the jump also completes');
  monotonic(frames, 'Animation-frame timestamps');
  monotonic(timers, 'Timer timestamps');
  return { frames, timers, jump, continued, final };
}

async function nativeMonotonicCallback() {
  const samples = [];
  for (let trial = 0; trial < 10; trial++) {
    const handles = new Set();
    let disposed = false;
    const clock = new ClockController({
      dateNow: Date.now,
      performanceNow: () => performance.now(),
      setTimeout: (callback, delay) => {
        if (disposed) return () => {};
        const handle = setTimeout(() => { handles.delete(handle); callback(); }, delay);
        handles.add(handle);
        return () => { clearTimeout(handle); handles.delete(handle); };
      },
      setInterval: () => { throw new Error('Unexpected native interval in the monotonicity control'); }
    });
    let beforeWork;
    let insideAfterWork;
    clock.install(0);
    try {
      clock.addTimer({ type: 'Timeout', delay: 5, func: () => {
        beforeWork = clock.performanceNow();
        // Exercise the supported real-time synchronization during a busy timer
        // callback. Native ordering is left entirely to Node's ordinary scheduler.
        const until = performance.now() + 20;
        while (performance.now() < until) {}
        insideAfterWork = clock.performanceNow();
      } });
      clock.resume();
      await new Promise(resolve => setTimeout(resolve, 40));
      const afterDrain = clock.performanceNow();
      monotonic([beforeWork, insideAfterWork, afterDrain], `Native trial ${trial}`);
      assert(insideAfterWork > beforeWork, 'Real time must advance during the busy callback');
      samples.push({ trial, beforeWork, insideAfterWork, afterDrain });
    } finally {
      // Dispose only this diagnostic embedder's own native handles. No production
      // globals or private ClockController fields/methods are changed.
      disposed = true;
      for (const handle of handles) clearTimeout(handle);
      handles.clear();
    }
  }
  return { trials: samples.length, samples, monotonic: true };
}

(async () => {
  const watchdog = setTimeout(() => {
    console.error('Clock-engine control exceeded its 15-second liveness bound');
    process.exit(1);
  }, 15_000);
  try {
    const serializationResults = [];
    for (const method of ['fastForward', 'runFor']) serializationResults.push(await serialization(method));
    const continuation = await timerAndFrameContinuation();
    const nativeMonotonicity = await nativeMonotonicCallback();
    console.log(JSON.stringify({
      control: 'Installed Playwright 1.57.0 clock-engine regression checks',
      limitation: 'Controlled FIFO embedder and naturally scheduled Node timer checks only. These do not execute Chromium, prove the hosted portal failure cause, or replace application/browser acceptance.',
      upstream: ['https://github.com/microsoft/playwright/pull/37705', 'https://github.com/microsoft/playwright/pull/37820'],
      node: process.version, playwright: version, sourceSha256,
      serialization: serializationResults, continuation, nativeMonotonicity
    }, null, 2));
  } finally { clearTimeout(watchdog); }
})().catch(error => { console.error(error); process.exitCode = 1; });
