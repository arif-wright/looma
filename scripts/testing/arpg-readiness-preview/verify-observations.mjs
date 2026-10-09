import assert from 'node:assert/strict';
import { FLOW_CAP_MS, EXPECTED_REWARD_MUTATIONS, expectedStart, sameJson, validSign, validComplete } from './protocol.mjs';
export const EXPECTED_STARTS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const EXPECTED_SCENES = [1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 1];
const empty = (value, reason) => assert.deepEqual(value, [], reason);
const finite = value => assert(Number.isFinite(value) && value >= 0);
const apiCalls = (state, path) => state.api.filter(call => call.path === path);
const imageSet = scene => {
  assert.equal(new Set(scene.queuedKeys).size, 249, 'Actual scene queues its complete image set');
};
const rendered = scene => {
  imageSet(scene); finite(scene.createAt);
  assert.equal(scene.decodedKeys.length, 249);
  assert.deepEqual([...scene.decodedKeys].sort(), [...scene.queuedKeys].sort(), 'Every queued texture is genuinely decoded');
  empty(scene.missingKeys, 'No missing decoded textures');
  assert(scene.framesAfterCreate > 0); assert(scene.gameplay); finite(scene.gameplay.at);
};
const town = (gameplay, elapsed = 0) => {
  assert.equal(gameplay.area, 0); assert.equal(gameplay.expeditionActive, false); assert.equal(gameplay.elapsed, elapsed);
};
export function verifyObservation(observation, index) {
  const state = observation.state, cleanup = observation.afterCleanup;
  assert.equal(state?.ready, true); assert(cleanup);
  for (const value of [state, cleanup]) {
    assert.equal(value.profile, index === 10 ? 'return-flow' : 'readiness');
    empty(value.blocked, 'No forbidden fetch');
    assert.deepEqual(value.rewardMutations, index === 10 ? EXPECTED_REWARD_MUTATIONS : [], 'Only the flow case records its synthetic zero-value receipt');
    assert(Array.isArray(value.api));
    for (const call of value.api) {
      finite(call.at);
      if (call.path === '/api/games/session/start' && call.method === 'POST') {
        assert(sameJson(call.body, expectedStart), 'Exact unchanged SDK start request'); finite(call.responseAt); assert(call.responseAt >= call.at);
      } else if (call.path === '/api/leaderboard/arpg/alltime' && call.method === 'GET') {
        assert.equal(call.body, undefined);
      } else {
        assert.equal(index, 10, 'Settlement is forbidden outside the explicit return-flow case');
        assert(['/api/games/sign', '/api/games/session/complete', '/api/games/player/state'].includes(call.path));
        assert.equal(call.method, call.path === '/api/games/player/state' ? 'GET' : 'POST');
      }
    }
    assert.equal(value.scenes.length, EXPECTED_SCENES[index]);
    for (const scene of value.scenes) imageSet(scene);
    assert.equal(apiCalls(value, '/api/games/session/start').length, EXPECTED_STARTS[index]);
  }
  assert.deepEqual(cleanup.api, state.api, 'Cleanup cannot make another API call');
  assert.equal(cleanup.canvasCount, 0); assert.equal(cleanup.authCallbacks, 0); empty(cleanup.mountedPages, 'No mounted page after cleanup');
  assert(cleanup.scenes.every(scene => scene.destroyed === true));
  const active = state.scenes.filter(scene => !scene.destroyed);
  if ([0, 1, 2, 3, 8, 9, 10].includes(index)) {
    assert.equal(active.length, 1); rendered(active[0]);
    if (index === 0) {
      assert.equal(active[0].gameplay.area, 1); assert.equal(active[0].gameplay.expeditionActive, true);
      assert.equal(active[0].gameplay.durationLimit, 90000, 'Default expedition remains capped at ninety seconds');
      assert(state.pages.some(page => page.status === 'Expedition in progress. Return to town to save your result.'));
    } else if (index === 10) {
      town(active[0].gameplay, active[0].gameplay.elapsed);
      assert(state.pages.some(page => page.status === 'Result saved. Town is untimed; depart again whenever you’re ready.'));
    } else {
      town(active[0].gameplay);
      assert(state.pages.some(page => page.status === 'Town is untimed. Depart when you’re ready.'));
    }
  } else {
    empty(active, 'Interrupted towns have no remaining scene');
  }
  if ([3, 4, 5, 6, 7, 9].includes(index)) assert.equal(state.scenes[0].createAt, null, 'Late assets cannot revive cancelled scene');
  if (index === 1) assert(state.scenes[0].loadErrors.includes('floor_0'));
  if (index === 2) {
    assert.equal(state.scenes[0].loadComplete, true); assert(state.scenes[0].missingKeys.includes('floor_0'));
    empty(state.scenes[0].loadErrors, 'Decode failure is distinct from download failure');
  }
  const checkpoints = state.checkpoints;
  assert(Array.isArray(checkpoints));
  const labels = index === 0 ? ['assets-pending', 'town-ready', 'departure-pending', 'expedition-started']
    : index === 10 ? ['town-before-idle', 'town-after-idle', 'expedition-started', 'hero-moved', 'returned-and-saved', 'returned-town-after-idle'] : [];
  assert.deepEqual(checkpoints.map(item => item.label), labels);
  assert.deepEqual(cleanup.checkpoints, checkpoints);
  checkpoints.forEach((checkpoint, i) => {
    finite(checkpoint.at); assert(checkpoint.scene); assert.equal(checkpoint.scene.id, active[0].id);
    if (i > 0) assert(checkpoint.at >= checkpoints[i - 1].at);
  });
  if (index === 0) {
    const [pending, ready, waiting, began] = checkpoints;
    assert.equal(pending.starts, 0); assert.equal(pending.scene.createAt, null); assert.equal(pending.scene.gameplay, null);
    assert.equal(ready.starts, 0); rendered(ready.scene); town(ready.scene.gameplay);
    assert.equal(waiting.starts, 1); town(waiting.scene.gameplay);
    assert.equal(began.starts, 1); assert.equal(began.scene.gameplay.area, 1); assert.equal(began.scene.gameplay.expeditionActive, true);
    const [start] = apiCalls(state, '/api/games/session/start');
    assert(start.at >= ready.at); assert(start.responseAt >= waiting.at); assert(start.responseAt <= began.at);
  }
  if (index === 10) {
    const [before, idle, began, moved, returned, rested] = checkpoints;
    checkpoints.forEach(checkpoint => rendered(checkpoint.scene));
    assert.equal(before.starts, 0); assert.equal(idle.starts, 0); town(before.scene.gameplay); town(idle.scene.gameplay);
    assert(idle.at - before.at >= FLOW_CAP_MS, 'Native pre-departure idle exceeds the synthetic expedition cap');
    for (const point of [began, moved]) {
      assert.equal(point.starts, 1); assert.equal(point.scene.gameplay.area, 1); assert.equal(point.scene.gameplay.expeditionActive, true);
      assert.equal(point.scene.gameplay.durationLimit, FLOW_CAP_MS);
    }
    assert(Math.hypot(moved.scene.gameplay.x - began.scene.gameplay.x, moved.scene.gameplay.y - began.scene.gameplay.y) > 20, 'Real keyboard input moved the hero');
    const duration = returned.scene.gameplay.elapsed;
    assert(duration > 0 && duration < FLOW_CAP_MS, 'Explicit return happens before timeout');
    for (const point of [returned, rested]) {
      assert.equal(point.starts, 1); town(point.scene.gameplay, duration);
      assert.equal(point.scene.gameplay.returned, true); assert.equal(point.scene.gameplay.outcome, 'retreated');
    }
    assert(rested.at - returned.at >= FLOW_CAP_MS, 'Native returned-town idle exceeds the expedition cap');
    const sign = apiCalls(state, '/api/games/sign'), complete = apiCalls(state, '/api/games/session/complete'), player = apiCalls(state, '/api/games/player/state');
    assert.equal(sign.length, 1); assert.equal(complete.length, 1); assert.equal(player.length, 1);
    assert(validSign(sign[0].body)); assert(validComplete(complete[0].body, sign[0].body));
    assert.equal(complete[0].body.stats.expeditionDurationMs, Math.floor(duration));
    assert.equal(complete[0].body.durationMs, Math.max(1000, Math.floor(duration)));
    assert(sign[0].at >= moved.at && complete[0].at >= sign[0].at && player[0].at >= complete[0].at && player[0].at <= returned.at);
    const [start] = apiCalls(state, '/api/games/session/start');
    assert(start.at >= idle.at && start.responseAt <= began.at);
    assert.equal(player[0].body, undefined);
  }
}
