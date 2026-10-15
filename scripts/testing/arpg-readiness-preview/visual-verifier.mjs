import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VISUAL_MODE, VISUAL_TITLES, VISUAL_POSES, VISUAL_LIMITS, visualScreenshot, visualViewport, visualClearance, visualCameraStable } from './visual-contract.mjs';
import { courtyardGraphicsIssues, courtyardOwnershipIssues } from './courtyard-graphics.mjs';
import { plazaObjectsIssues, plazaGeometryIssues, PLAZA_KEYS } from './plaza-contract.mjs';
import { verifyCapturedPNG, verifyVisibilityObservation } from './courtyard-capture-contract.mjs';
import { decodeCourtyardPNG } from './courtyard-png.mjs';

const FILE = 'visual.spec.ts', PROJECT = 'chromium-arpg-controlled-visual';
const empty = (value, message) => assert.deepEqual(value, [], message);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mode = value => {
  assert.equal(value.evidenceMode, VISUAL_MODE, 'Visual-only provenance is mandatory');
  assert.equal(value.nativeMovementEvidence, false, 'Controlled poses cannot prove native movement');
};
const neutral = frame => {
  assert.deepEqual(frame.intent, { x: 0, y: 0 });
  assert.deepEqual(frame.velocity, { vx: 0, vy: 0 }); assert.equal(frame.dashTimer, 0);
};
export function verifyVisualReceipt(receipt, index, previous = null) {
  mode(receipt);
  const pose = VISUAL_POSES[index]; assert(pose);
  assert.equal(receipt.assignment, 'actual-ecs-transform');
  assert.equal(receipt.sequence, index + 1); assert.equal(receipt.poseId, pose.id);
  for (const key of ['sceneId', 'playerId']) assert(Number.isSafeInteger(receipt[key]) && receipt[key] > 0);
  assert.deepEqual(receipt.clearance, visualClearance(pose)); assert.equal(receipt.clearance.valid, true);
  assert.deepEqual(receipt.assigned, { x: pose.x, y: pose.y, rot: receipt.prior.rot });
  assert(Object.values(receipt.prior).every(finite));
  assert.deepEqual(receipt.settled, receipt.assigned);
  assert(finite(receipt.assignedAt));
  assert(Number.isSafeInteger(receipt.assignedNativeFrame) && receipt.assignedNativeFrame >= 0);
  assert(Number.isSafeInteger(receipt.assignedFrameCounter) && receipt.assignedFrameCounter >= receipt.assignedNativeFrame && receipt.assignedFrameCounter <= receipt.assignedNativeFrame + 1);
  assert.equal(receipt.cameraTolerance, VISUAL_LIMITS.cameraTolerance);
  assert.equal(receipt.stableComparisons, VISUAL_LIMITS.stableComparisons);
  assert(Array.isArray(receipt.frames) && receipt.frames.length >= 4 && receipt.frames.length <= VISUAL_LIMITS.framesPerPose);
  if (previous) {
    assert.deepEqual(receipt.prior, previous.settled, 'Each explicit setup jump starts from the previous stationary pose');
    assert(receipt.assignedAt >= previous.settledAt && receipt.assignedNativeFrame >= previous.settledNativeFrame);
    assert.equal(receipt.sceneId, previous.sceneId); assert.equal(receipt.playerId, previous.playerId);
  } else assert.deepEqual(receipt.prior, { x: 1472, y: 536, rot: 0 }, 'Initial real town spawn is observed before setup');
  let stable = 0;
  receipt.frames.forEach((frame, i) => {
    const previousFrame = receipt.frames[i - 1];
    assert(Number.isSafeInteger(frame.nativeFrame) && frame.nativeFrame > (previousFrame?.nativeFrame ?? receipt.assignedNativeFrame));
    assert(finite(frame.at) && frame.at >= (previousFrame?.at ?? receipt.assignedAt));
    assert.deepEqual(frame.transform, receipt.assigned, 'Only stationary per-assignment frames qualify'); neutral(frame);
    const sprite = frame.sprite; assert(sprite && finite(sprite.x) && finite(sprite.y) && finite(sprite.depth));
    assert(typeof sprite.texture === 'string' && sprite.texture.length > 0);
    assert(typeof sprite.frame === 'string' || Number.isFinite(sprite.frame));
    assert(typeof sprite.animation === 'string' && /^hero-knight_armed_idle-(N|NE|E|SE|S|SW|W|NW)$/.test(sprite.animation)); assert.equal(typeof sprite.playing, 'boolean');
    assert(visualCameraStable(frame.camera, frame.camera), 'Finite complete actual camera matrix and viewport required');
    const synced = sprite.x === frame.transform.x && sprite.y === frame.transform.y && sprite.depth === frame.transform.y + 20;
    stable = synced && previousFrame && visualCameraStable(previousFrame.camera, frame.camera) ? stable + 1 : 0;
    if (i < receipt.frames.length - 1) assert(stable < 3, 'No extra frame substitution after settling');
  });
  assert.equal(stable, 3, 'Three consecutive native camera comparisons must pass');
  const last = receipt.frames.at(-1);
  assert.equal(receipt.settledNativeFrame, last.nativeFrame); assert.equal(receipt.settledAt, last.at);
  assert(receipt.settledAt - receipt.assignedAt <= VISUAL_LIMITS.caseMs);
  return receipt;
}

// Shared bounded decoder: same byte/CRC/filter contract as native captures.
export function verifyVisualPNG(bytes, backing) {
  const decoded = decodeCourtyardPNG(bytes);
  assert.deepEqual({ width: decoded.width, height: decoded.height }, backing);
}

function verifyVisualGameplay(g, receipt, capture) {
  assert(g && finite(g.at) && g.at >= receipt.settledAt);
  assert.equal(g.area, 0); assert.equal(g.expeditionActive, false); assert.equal(g.returned, false); assert.equal(g.outcome, 'preparing');
  assert.equal(g.elapsed, 0); assert.equal(g.x, receipt.assigned.x); assert.equal(g.y, receipt.assigned.y);
  assert.deepEqual(g.intent, { x: 0, y: 0 }); assert.equal(g.dash?.timer, 0);
  empty(courtyardGraphicsIssues(g)); empty(plazaObjectsIssues(g)); empty(plazaGeometryIssues(g));
  verifyVisibilityObservation(g);
  const visibility = g.courtyardVisibility;
  assert.equal(visibility?.method, 'analytic-source-transmission'); assert.equal(visibility.nativePixels, false);
  assert.equal(visibility.valid, true); empty(visibility.issues);
  assert.equal(visibility.alphaThreshold, 128); assert.equal(visibility.sampleStep, 3);
  assert(Number.isInteger(visibility.samples) && visibility.samples >= 20 && visibility.samples <= 16384);
  assert(Number.isInteger(visibility.readable) && visibility.readable >= visibility.samples / 2 && visibility.readable <= visibility.samples);
  assert(finite(visibility.meanTransmission) && visibility.meanTransmission >= .4 && visibility.meanTransmission <= 1);
  assert.deepEqual(visibility.viewport, { css: capture.css, backing: capture.backing, logical: capture.logical });
  const camera = receipt.frames.at(-1).camera;
  assert(visualCameraStable(camera, g.viewportGeometry.camera), 'Captured camera must agree with the settled pose');
  assert.deepEqual(visibility.camera.matrix, g.viewportGeometry.camera.matrix);
  assert.equal(visibility.camera.scrollX, g.viewportGeometry.camera.scrollX); assert.equal(visibility.camera.scrollY, g.viewportGeometry.camera.scrollY);
  assert.deepEqual(visibility.walls.map(w => w.objectId), g.townArt.ground.courtyard.map(w => w.objectId));
  visibility.walls.forEach((wall, i) => {
    const object = g.townArt.ground.courtyard[i];
    for (const key of ['name','alpha','depth','x','y','scaleX','scaleY','rotation']) assert.equal(wall[key], object[key]);
    assert.deepEqual(wall.commands, object.commands);
  });
}

export function verifyVisualState(observation, driver, index, attachments) {
  const state = observation.state, cleanup = observation.afterCleanup;
  assert(state && cleanup); mode(driver);
  assert.equal(driver.kind, 'controlled-courtyard-visual-driver'); assert.equal(driver.index, index); assert.equal(driver.completed, true);
  assert(finite(driver.elapsedMs) && driver.elapsedMs > 0 && driver.elapsedMs <= VISUAL_LIMITS.caseMs);
  assert.deepEqual(driver.poseIds, VISUAL_POSES.map(pose => pose.id));
  const visual = driver.visual; mode(visual);
  assert.equal(visual.enabled, true); assert.equal(visual.bound, true); assert.equal(visual.closed, false);
  assert.equal(visual.pending, false); assert.equal(visual.complete, true); empty(visual.errors);
  assert.equal(visual.receipts.length, 6);
  visual.receipts.forEach((receipt, i) => verifyVisualReceipt(receipt, i, visual.receipts[i - 1]));
  for (const snapshot of [state, cleanup]) {
    assert.equal(snapshot.ready, true); assert.equal(snapshot.profile, 'readiness');
    empty(snapshot.blocked); empty(snapshot.rewardMutations); empty(snapshot.navigations); assert.equal(snapshot.plazaMotionOverflow, false);
    assert(Array.isArray(snapshot.api));
    assert(snapshot.api.every(call => call.path === '/api/leaderboard/arpg/alltime' && call.method === 'GET'), 'Visual isolation permits no departure, session or reward calls');
    assert.equal(snapshot.scenes.length, 1); const scene = snapshot.scenes[0];
    assert.equal(scene.id, visual.receipts[0].sceneId); assert.equal(scene.pageId, 1);
    assert.equal(scene.loadComplete, true); assert.equal(scene.totalFailed, 0); empty(scene.missingKeys); empty(scene.loadErrors);
    assert.equal(new Set(scene.queuedKeys).size, 257); assert.equal(scene.queuedKeys.length, 257);
    assert.deepEqual([...scene.decodedKeys].sort(), [...scene.queuedKeys].sort());
    for (const key of ['town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1', ...PLAZA_KEYS]) assert(scene.queuedKeys.includes(key));
    assert(finite(scene.preloadAt) && finite(scene.createAt) && scene.createAt >= scene.preloadAt && scene.framesAfterCreate > 0);
    const evidence = snapshot.courtyardEvidence; mode(evidence); assert.equal(evidence.visualEnabled, true);
    assert.deepEqual(evidence.visual.receipts, visual.receipts); empty(evidence.visual.errors);
    assert.equal(evidence.visual.complete, true); assert.equal(evidence.visual.pending, false);
    // Do not run swept-route validation across controlled assignment jumps.
    // The complete unsliced trace is retained; stationary segments are proved
    // independently by the assignment-tagged native-frame receipts above.
    assert(Array.isArray(snapshot.plazaMotion) && snapshot.plazaMotion.length > 0 && snapshot.plazaMotion.length <= 12000);
    const byFrame = new Map();
    for (const [i, sample] of snapshot.plazaMotion.entries()) {
      assert.equal(sample.area, 0); assert.deepEqual(sample.intent, { x: 0, y: 0 }); assert.equal(sample.dash?.timer, 0);
      const frame = sample.courtyardFrame;
      assert(finite(sample.at) && finite(sample.x) && finite(sample.y) && Number.isSafeInteger(frame?.frame) && frame.frame >= 0 && finite(frame.delta) && frame.delta >= 0);
      if (i) assert(frame.frame > snapshot.plazaMotion[i - 1].courtyardFrame.frame && sample.at >= snapshot.plazaMotion[i - 1].at);
      assert(!byFrame.has(frame.frame)); byFrame.set(frame.frame, sample);
    }
    for (const receipt of visual.receipts) for (const frame of receipt.frames) {
      const sample = byFrame.get(frame.nativeFrame);
      assert(sample && sample.at <= frame.at && frame.at - sample.at < 1000, 'Stationary receipt retains its actual raw native sample');
      assert.equal(sample.x, frame.transform.x); assert.equal(sample.y, frame.transform.y);
      assert.deepEqual(sample.courtyardFrame.hero, { textureKey: frame.sprite.texture, frameName: frame.sprite.frame, animation: frame.sprite.animation, playing: frame.sprite.playing });
    }
  }
  assert.equal(state.scenes[0].destroyed, false); assert.equal(cleanup.scenes[0].destroyed, true);
  assert.equal(state.courtyardEvidence.visual.closed, false); assert.equal(cleanup.courtyardEvidence.visual.closed, true);
  assert.equal(cleanup.authCallbacks, 0); assert.equal(cleanup.canvasCount, 0); empty(cleanup.mountedPages);
  assert.deepEqual(cleanup.api, state.api); assert.deepEqual(cleanup.rewardMutations, state.rewardMutations);
  assert.deepEqual(cleanup.plazaMotion.slice(0, state.plazaMotion.length), state.plazaMotion);
  assert.equal(driver.captures.length, 6);
  const history = driver.captureState; mode(history);
  assert.equal(history.requests, 6); assert.equal(history.captureCount, 6); assert.equal(history.pending, false); assert.equal(history.requested, false);
  assert(isDeepStrictEqual(history.history, driver.captures.map(capture => capture.metadata)), 'Capture history must retain every complete metadata snapshot');
  const pngAttachments = attachments.filter(attachment => attachment.contentType === 'image/png');
  assert.equal(pngAttachments.length, 6, 'Exactly six distinct visual-only PNGs per case');
  for (const [i, capture] of driver.captures.entries()) {
    const metadata = capture.metadata, receipt = visual.receipts[i], label = visualScreenshot(index, receipt.poseId);
    mode(metadata); assert.equal(metadata.label, label); assert.deepEqual(metadata.poseReceipt, receipt);
    assert.deepEqual(metadata.viewport, visualViewport(index)); assert.equal(metadata.documentWidth, metadata.viewport.width);
    for (const key of ['width', 'height']) assert(finite(metadata.css[key]) && metadata.css[key] > 0 && finite(metadata.logical[key]) && metadata.logical[key] > 0);
    assert(finite(metadata.css.x) && finite(metadata.css.y) && metadata.css.x >= 0 && metadata.css.y >= 0);
    assert(metadata.css.x + metadata.css.width <= metadata.viewport.width + 1);
    assert(metadata.css.y + metadata.css.height <= metadata.viewport.height + 1);
    const g = metadata.gameplay, probe = g?.plazaProbe;
    assert(Number.isSafeInteger(metadata.nativeFrame) && metadata.nativeFrame > receipt.settledNativeFrame, 'PNG is rendered after its settled-pose observation');
    assert.equal(metadata.heroFrame?.animation, receipt.frames.at(-1).sprite.animation, 'Capture retains the observed idle animation');
    assert(probe && Number.isSafeInteger(probe.id) && probe.id === i + 1 && probe.id === metadata.probeId);
    assert(probe.requestedAt >= receipt.settledAt && probe.respondedAt === g.at && probe.requestedAt <= g.at);
    assert(state.plazaMotion.some(sample => sample.courtyardFrame.frame === metadata.nativeFrame && sample.at === g.at && sample.x === g.x && sample.y === g.y), 'PNG retains its same-frame raw observation');
    assert.equal(metadata.at, g.at); assert(finite(metadata.capturedAt) && metadata.capturedAt >= g.at);
    assert(finite(metadata.consumedAt) && metadata.consumedAt >= metadata.capturedAt && metadata.consumedAt - metadata.capturedAt < 15000);
    verifyVisualGameplay(g, receipt, metadata);
    if (i) empty(courtyardOwnershipIssues(driver.captures[0].metadata.gameplay, g, false));
    const images = pngAttachments.filter(image => image.name === label); assert.equal(images.length, 1);
    const base64 = images[0].body;
    assert(typeof base64 === 'string' && base64.length >= 136 && base64.length <= 8000000 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64));
    assert.equal(metadata.base64Chars, base64.length);
    const bytes = Buffer.from(base64, 'base64'); assert.equal(bytes.toString('base64'), base64);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.pngSHA256);
    verifyCapturedPNG(metadata, base64, { label, gameplay: g, index, mode: VISUAL_MODE, poseId: receipt.poseId });
  }
  const wall = (i, side) => driver.captures[i].metadata.gameplay.townArt.ground.courtyard.find(object => object.name === `town-courtyard-${side}-upper`);
  assert.equal(wall(1, 'west').alpha, .28); assert.equal(wall(2, 'east').alpha, .28);
  assert.equal(wall(3, 'west').alpha, .28); assert.equal(wall(3, 'east').alpha, .28);
  assert.equal(wall(4, 'west').alpha, 1); assert.equal(wall(5, 'east').alpha, 1);
  assert(wall(4, 'west').depth < wall(4, 'east').depth); assert(wall(5, 'east').depth < wall(5, 'west').depth);
}

export function verifyVisual(report, requestedMode) {
  assert(['discovery', 'execution'].includes(requestedMode)); const execution = requestedMode === 'execution';
  empty(report.errors); assert.equal(report.config.version, '1.57.0'); assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.workers, 1); assert.equal(report.config.shard, null); assert.equal(report.config.projects.length, 1);
  const project = report.config.projects[0];
  assert.equal(project.id, PROJECT); assert.equal(project.name, PROJECT); assert.equal(project.repeatEach, 1); assert.equal(project.retries, 0); assert.deepEqual(project.testMatch, [FILE]);
  assert.equal(report.suites.length, 1); const suite = report.suites[0];
  assert.equal(suite.file, FILE); assert.equal(suite.title, FILE); empty(suite.suites ?? []); assert.equal(suite.specs.length, 2);
  const ids = new Set();
  suite.specs.forEach((spec, index) => {
    assert.equal(spec.title, VISUAL_TITLES[index]); assert.equal(spec.file, FILE); assert.equal(spec.ok, true);
    assert(typeof spec.id === 'string' && spec.id.length > 0 && !ids.has(spec.id)); ids.add(spec.id);
    assert.equal(spec.tests.length, 1); const test = spec.tests[0];
    assert.equal(test.projectId, PROJECT); assert.equal(test.projectName, PROJECT); assert.equal(test.expectedStatus, 'passed'); empty(test.annotations);
    assert.equal(test.status, execution ? 'expected' : 'skipped'); assert.equal(test.results.length, execution ? 1 : 0);
    if (!execution) return;
    const result = test.results[0]; assert.equal(result.status, 'passed'); assert.equal(result.retry, 0); assert.equal(result.error, undefined);
    empty(result.errors); empty(result.annotations); assert(Number.isInteger(result.workerIndex) && result.workerIndex >= 0);
    assert(finite(Date.parse(result.startTime))); assert(finite(result.duration) && result.duration > 0 && result.duration <= VISUAL_LIMITS.caseMs);
    const json = name => {
      const items = result.attachments.filter(item => item.name === name); assert.equal(items.length, 1);
      assert.equal(items[0].contentType, 'application/json'); assert.equal(typeof items[0].body, 'string');
      return JSON.parse(Buffer.from(items[0].body, 'base64').toString('utf8'));
    };
    const observation = json('arpg-real-engine-observations');
    assert.equal(observation.browserVersion, '143.0.7499.4');
    for (const key of ['blocked','errors','consoleErrors','unexpectedConsoleErrors','cleanupErrors']) empty(observation[key]);
    verifyVisualState(observation, json('courtyard-controlled-visual-driver'), index, result.attachments);
  });
  assert.equal(report.stats.expected, execution ? 2 : 0); assert.equal(report.stats.skipped, execution ? 0 : 2);
  assert.equal(report.stats.unexpected, 0); assert.equal(report.stats.flaky, 0);
  return execution ? 'Verified 2 controlled-scene visual-only cases and 12 same-frame PNG captures. Explicit ECS pose assignments are supplementary idle-pose visual evidence only; they do not satisfy native traversal, departure, reward, original-suite or gameplay acceptance.'
    : 'Verified discovery of 2 controlled-scene visual-only cases; ZERO executed. Discovery is not a browser pass.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, path, ...extra] = process.argv.slice(2); assert(path && !extra.length, 'Usage: node visual-verifier.mjs discovery|execution report.json');
  console.log(verifyVisual(JSON.parse(readFileSync(path, 'utf8')), mode));
}
