// Local diagnostic only. Hot paths write scalar numbers into fixed-capacity
// Float64Arrays. Objects and ordinary arrays are created only by snapshot().
export const STAGES = Object.freeze(['warmup', 'neutral', 'motion', 'checkpoint', 'done']);
export const KEY_CODES = Object.freeze(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
export const DEFAULT_CAPACITIES = Object.freeze({ frames: 18000, keyEvents: 4096, stageEvents: 128, scenes: 16 });
const FRAME_FIELDS = Object.freeze(['sequence', 'sceneId', 'stageId', 'at', 'intervalMs',
  'sceneUpdateCalls', 'sceneUpdateMs', 'promptCalls', 'promptExecutedCalls', 'promptMs',
  'renderPhaseMs', 'stateValid', 'x', 'y', 'intentX', 'intentY', 'area',
  'mainCameraFollowupdateListenerCount', 'documentHidden', 'engineTime', 'engineDelta']);
const KEY_FIELDS = Object.freeze(['sequence', 'sceneId', 'stageId', 'at', 'eventTimeStamp', 'codeId', 'down', 'repeat']);
const STAGE_FIELDS = Object.freeze(['sequence', 'stageId', 'at', 'frameCount']);

export class BoundedNumericBuffer {
  constructor(capacity, width) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1000000 ||
        !Number.isSafeInteger(width) || width < 1 || width > 128) throw new RangeError('Invalid numeric buffer dimensions');
    this.capacity = capacity;
    this.width = width;
    this.data = new Float64Array(capacity * width);
    this.count = 0;
    this.total = 0;
    this.overflow = false;
  }
  reserve() {
    this.total++;
    if (this.count === this.capacity) { this.overflow = true; return -1; }
    return this.count++;
  }
  write(row, column, value) {
    if (row < 0) return;
    if (!Number.isInteger(row) || row >= this.count || !Number.isInteger(column) || column < 0 || column >= this.width)
      throw new RangeError('Invalid numeric buffer cell');
    if (!Number.isFinite(value)) throw new TypeError('Numeric samples must be finite');
    this.data[row * this.width + column] = value;
  }
  read(row, column) { return this.data[row * this.width + column]; }
  reset() { this.data.fill(0); this.count = 0; this.total = 0; this.overflow = false; }
  snapshot(fields) {
    if (fields.length !== this.width) throw new RangeError('Incorrect numeric buffer field count');
    return Array.from({ length: this.count }, (_, row) => Object.fromEntries(fields.map((field, column) => [field, this.read(row, column)])));
  }
}

export function parsePromptTimingHash(hash) {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const mode = values.get('promptMode');
  const rawRun = values.get('promptRun');
  if (mode !== 'candidate' && mode !== 'bypass') throw new Error('promptMode must be candidate or bypass');
  if (rawRun === null || !/^\d+$/.test(rawRun) || !Number.isSafeInteger(Number(rawRun)))
    throw new Error('promptRun must be a non-negative safe integer');
  return { mode, runId: Number(rawRun) };
}

// Scene slots are also bounded and allocated before any renderer callbacks.
// Each scene row: installed, created, stopped, stop reason, active,
// previous POST_RENDER, PRE_RENDER start, pending update calls/duration,
// pending prompt calls/executed/duration, last follow listeners, engine time/delta.
const SCENE_WIDTH = 15;
export class PromptTimingMetrics {
  constructor({ mode, runId, now = () => performance.now(), capacities = DEFAULT_CAPACITIES }) {
    if (mode !== 'candidate' && mode !== 'bypass') throw new Error('Invalid diagnostic mode');
    if (!Number.isSafeInteger(runId) || runId < 0) throw new Error('Invalid diagnostic runId');
    this.mode = mode;
    this.runId = runId;
    this.now = now;
    this.capacities = Object.freeze({ ...DEFAULT_CAPACITIES, ...capacities });
    this.frames = new BoundedNumericBuffer(this.capacities.frames, FRAME_FIELDS.length);
    this.keys = new BoundedNumericBuffer(this.capacities.keyEvents, KEY_FIELDS.length);
    this.stages = new BoundedNumericBuffer(this.capacities.stageEvents, STAGE_FIELDS.length);
    this.scenes = new BoundedNumericBuffer(this.capacities.scenes, SCENE_WIDTH);
    this.sceneUpdateCalls = 0;
    this.sceneUpdateMs = 0;
    this.promptCalls = 0;
    this.promptExecutedCalls = 0;
    this.promptMs = 0;
    this.preRenderCalls = 0;
    this.postRenderCalls = 0;
    this.invalidSamples = 0;
    this.unpairedPostRenderCalls = 0;
    this.overwrittenPreRenderCalls = 0;
    this.activeScenes = 0;
    this.maxActiveScenes = 0;
    this.stageId = 0;
    this.startedAt = this.now();
    this.setStage('warmup', this.startedAt);
  }
  get frameCount() { return this.postRenderCalls; }
  validScene(sceneId) { return Number.isInteger(sceneId) && sceneId > 0 && sceneId <= this.scenes.count; }
  sceneOffset(sceneId) { return (sceneId - 1) * SCENE_WIDTH; }
  registerScene(at) {
    if (!Number.isFinite(at) || at < 0) { this.invalidSamples++; return 0; }
    const row = this.scenes.reserve();
    if (row < 0) return 0;
    const offset = row * SCENE_WIDTH, data = this.scenes.data;
    data[offset] = at;
    data[offset + 1] = data[offset + 2] = data[offset + 5] = data[offset + 6] = -1;
    data[offset + 4] = 1;
    data[offset + 13] = data[offset + 14] = -1;
    this.activeScenes++;
    this.maxActiveScenes = Math.max(this.maxActiveScenes, this.activeScenes);
    return row + 1;
  }
  createdScene(sceneId, at) {
    if (this.validScene(sceneId) && Number.isFinite(at) && at >= 0) this.scenes.data[this.sceneOffset(sceneId) + 1] = at;
    else this.invalidSamples++;
  }
  stoppedScene(sceneId, at, reason) {
    if (!this.validScene(sceneId) || !Number.isFinite(at) || at < 0) { this.invalidSamples++; return; }
    const offset = this.sceneOffset(sceneId), data = this.scenes.data;
    if (data[offset + 4] === 0) return;
    data[offset + 2] = at;
    data[offset + 3] = reason;
    data[offset + 4] = 0;
    this.activeScenes--;
  }
  setStage(stage, at = this.now()) {
    const stageId = STAGES.indexOf(stage);
    if (stageId < 0) throw new Error('Invalid diagnostic stage');
    if (!Number.isFinite(at) || at < 0) throw new Error('Invalid stage timestamp');
    this.stageId = stageId;
    const row = this.stages.reserve(), data = this.stages.data, offset = row * STAGE_FIELDS.length;
    if (row >= 0) { data[offset] = this.stages.total; data[offset + 1] = stageId; data[offset + 2] = at; data[offset + 3] = this.frameCount; }
    return at;
  }
  recordPrompt(sceneId, startedAt, endedAt, executed) {
    this.promptCalls++;
    this.promptExecutedCalls += executed ? 1 : 0;
    if (!this.validScene(sceneId) || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) { this.invalidSamples++; return; }
    const duration = endedAt - startedAt, offset = this.sceneOffset(sceneId), data = this.scenes.data;
    this.promptMs += duration;
    data[offset + 9]++;
    data[offset + 10] += executed ? 1 : 0;
    data[offset + 11] += duration;
  }
  recordUpdate(sceneId, startedAt, endedAt, engineTime, engineDelta) {
    this.sceneUpdateCalls++;
    if (!this.validScene(sceneId) || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt ||
        !Number.isFinite(engineTime) || !Number.isFinite(engineDelta)) { this.invalidSamples++; return; }
    const duration = endedAt - startedAt, offset = this.sceneOffset(sceneId), data = this.scenes.data;
    this.sceneUpdateMs += duration;
    data[offset + 7]++;
    data[offset + 8] += duration;
    data[offset + 13] = engineTime;
    data[offset + 14] = engineDelta;
  }
  recordPreRender(sceneId, at) {
    this.preRenderCalls++;
    if (!this.validScene(sceneId) || !Number.isFinite(at) || at < 0) { this.invalidSamples++; return; }
    const offset = this.sceneOffset(sceneId) + 6;
    if (this.scenes.data[offset] >= 0) this.overwrittenPreRenderCalls++;
    this.scenes.data[offset] = at;
  }
  recordPostRender(sceneId, at, stateValid, x, y, intentX, intentY, area, followListeners, documentHidden) {
    this.postRenderCalls++;
    if (!this.validScene(sceneId) || !Number.isFinite(at) || at < 0 || !Number.isFinite(followListeners) ||
        (stateValid && (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(intentX) || !Number.isFinite(intentY) || !Number.isFinite(area)))) {
      this.invalidSamples++; return;
    }
    const sceneOffset = this.sceneOffset(sceneId), scenes = this.scenes.data;
    const previous = scenes[sceneOffset + 5], renderStart = scenes[sceneOffset + 6];
    if ((previous >= 0 && at < previous) || (renderStart >= 0 && at < renderStart)) { this.invalidSamples++; return; }
    if (renderStart < 0) this.unpairedPostRenderCalls++;
    const row = this.frames.reserve(), offset = row * FRAME_FIELDS.length, data = this.frames.data;
    if (row >= 0) {
      data[offset] = this.postRenderCalls; data[offset + 1] = sceneId; data[offset + 2] = this.stageId; data[offset + 3] = at;
      data[offset + 4] = previous < 0 ? -1 : at - previous;
      data[offset + 5] = scenes[sceneOffset + 7]; data[offset + 6] = scenes[sceneOffset + 8];
      data[offset + 7] = scenes[sceneOffset + 9]; data[offset + 8] = scenes[sceneOffset + 10]; data[offset + 9] = scenes[sceneOffset + 11];
      data[offset + 10] = renderStart < 0 ? -1 : at - renderStart; data[offset + 11] = stateValid ? 1 : 0;
      data[offset + 12] = stateValid ? x : 0; data[offset + 13] = stateValid ? y : 0;
      data[offset + 14] = stateValid ? intentX : 0; data[offset + 15] = stateValid ? intentY : 0; data[offset + 16] = stateValid ? area : 0;
      data[offset + 17] = followListeners; data[offset + 18] = documentHidden ? 1 : 0;
      data[offset + 19] = scenes[sceneOffset + 13]; data[offset + 20] = scenes[sceneOffset + 14];
    }
    scenes[sceneOffset + 5] = at; scenes[sceneOffset + 6] = -1;
    scenes[sceneOffset + 7] = scenes[sceneOffset + 8] = scenes[sceneOffset + 9] = scenes[sceneOffset + 10] = scenes[sceneOffset + 11] = 0;
    scenes[sceneOffset + 12] = followListeners;
    scenes[sceneOffset + 13] = scenes[sceneOffset + 14] = -1;
  }
  recordKey(sceneId, at, eventTimeStamp, codeId, down, repeat, trusted) {
    if (trusted !== true) return;
    if (!this.validScene(sceneId) || !Number.isFinite(at) || at < 0 || !Number.isFinite(eventTimeStamp) || eventTimeStamp < 0 ||
        !Number.isInteger(codeId) || codeId < 0 || codeId >= KEY_CODES.length) { this.invalidSamples++; return; }
    const row = this.keys.reserve(), offset = row * KEY_FIELDS.length, data = this.keys.data;
    if (row < 0) return;
    data[offset] = this.keys.total; data[offset + 1] = sceneId; data[offset + 2] = this.stageId; data[offset + 3] = at;
    data[offset + 4] = eventTimeStamp; data[offset + 5] = codeId; data[offset + 6] = down ? 1 : 0; data[offset + 7] = repeat ? 1 : 0;
  }
  snapshot(at = this.now()) {
    const frames = this.frames.snapshot(FRAME_FIELDS).map(frame => {
      frame.stage = STAGES[frame.stageId]; delete frame.stageId;
      frame.stateValid = Boolean(frame.stateValid); frame.documentHidden = Boolean(frame.documentHidden);
      if (frame.intervalMs < 0) frame.intervalMs = null;
      if (frame.renderPhaseMs < 0) frame.renderPhaseMs = null;
      if (frame.engineTime < 0) frame.engineTime = null;
      if (frame.engineDelta < 0) frame.engineDelta = null;
      if (!frame.stateValid) frame.x = frame.y = frame.intentX = frame.intentY = frame.area = null;
      return frame;
    });
    const keyEvents = this.keys.snapshot(KEY_FIELDS).map(event => {
      event.stage = STAGES[event.stageId]; delete event.stageId;
      event.code = KEY_CODES[event.codeId]; delete event.codeId;
      event.type = event.down ? 'keydown' : 'keyup'; delete event.down;
      event.repeat = Boolean(event.repeat); event.isTrusted = true;
      return event;
    });
    const stageEvents = this.stages.snapshot(STAGE_FIELDS).map(event => {
      event.stage = STAGES[event.stageId]; delete event.stageId; return event;
    });
    const scenes = Array.from({ length: this.scenes.count }, (_, index) => {
      const offset = index * SCENE_WIDTH, data = this.scenes.data;
      return { sceneId: index + 1, installedAt: data[offset], createdAt: data[offset + 1] < 0 ? null : data[offset + 1],
        stoppedAt: data[offset + 2] < 0 ? null : data[offset + 2], stopReason: [null, 'shutdown', 'destroy', 'game-destroy'][data[offset + 3]],
        active: data[offset + 4] === 1, mainCameraFollowupdateListenerCount: data[offset + 12] };
    });
    return {
      kind: 'arpg-prompt-timing-diagnostic', version: 1, mode: this.mode, runId: this.runId,
      timestampOrigin: 'performance.now', startedAt: this.startedAt, snapshotAt: at, stage: STAGES[this.stageId],
      counterfactual: this.mode === 'bypass',
      bypassInterpretation: 'Bypass does not execute updatePortalPromptVisibility. Visibility state and subsequent render work may differ; it is not an isolated subtraction of callback CPU cost.',
      promptTimingInterpretation: 'promptMs is the raw timing-bracket span: candidate includes the unchanged original callback and synchronous callees; bypass measures the no-op branch. Both take two performance.now reads and include clock/branch overhead, excluding subsequent metric writes and snapshot allocation. No baseline subtraction or causal GC attribution.',
      renderPhaseInterpretation: 'Main-thread wall-clock duration from Core PRE_RENDER listener entry to Core POST_RENDER listener entry; not GPU execution cost.',
      capacities: { ...this.capacities },
      counts: { frames: this.postRenderCalls, framesAccepted: this.frames.total, framesStored: this.frames.count, keyEvents: this.keys.total, keyEventsStored: this.keys.count,
        stageEvents: this.stages.total, stageEventsStored: this.stages.count, scenes: this.scenes.total, scenesStored: this.scenes.count,
        activeScenes: this.activeScenes, maxActiveScenes: this.maxActiveScenes, sceneUpdateCalls: this.sceneUpdateCalls, sceneUpdateMs: this.sceneUpdateMs,
        promptCalls: this.promptCalls, promptExecutedCalls: this.promptExecutedCalls, promptBypassedCalls: this.promptCalls - this.promptExecutedCalls,
        promptMs: this.promptMs, preRenderCalls: this.preRenderCalls, invalidSamples: this.invalidSamples,
        unpairedPostRenderCalls: this.unpairedPostRenderCalls, overwrittenPreRenderCalls: this.overwrittenPreRenderCalls },
      overflow: { frames: this.frames.overflow, keyEvents: this.keys.overflow, stageEvents: this.stages.overflow, scenes: this.scenes.overflow },
      frames, keyEvents, stageEvents, scenes
    };
  }
}
