import assert from 'node:assert/strict';
import { townGroundIssues } from './town-ground.mjs';
import { phoneGeometryIssues } from './phone-geometry.mjs';
import { DESKTOP_TOWN_SCREENSHOT, PHONE_TOWN_SCREENSHOT } from './screenshots.mjs';
import { FLOW_CAP_MS, EXPECTED_REWARD_MUTATIONS, expectedStart, sameJson, validSign, validComplete } from './protocol.mjs';
export const EXPECTED_STARTS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
const EXPECTED_SCENES = [1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1];
const empty = (value, reason) => assert.deepEqual(value, [], reason);
const finite = value => assert(Number.isFinite(value) && value >= 0);
const apiCalls = (state, path) => state.api.filter(call => call.path === path);
const imageSet = scene => {
  assert.equal(new Set(scene.queuedKeys).size, 253, 'Actual scene queues its complete image set');
  for (const key of ['town_cobble_material_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1', 'town_ruins_entrance_v1']) assert(scene.queuedKeys.includes(key), 'All four runtime town PNGs are required');
};
const rendered = scene => {
  imageSet(scene); finite(scene.createAt);
  assert.equal(scene.decodedKeys.length, 253);
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
  if ([0, 1, 2, 3, 8, 9, 10, 11].includes(index)) {
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
  const visuals = state.visuals;
  assert(Array.isArray(visuals));
  assert.deepEqual(cleanup.visuals, visuals, 'Cleanup preserves captured art observations');
  assert.deepEqual(visuals.map(item => item.label), index === 10 ? [DESKTOP_TOWN_SCREENSHOT] : index === 11 ? [PHONE_TOWN_SCREENSHOT] : []);
  for (const visual of visuals) {
    finite(visual.at); assert.equal(visual.starts, 0);
    if (index === 10) assert(visual.at < apiCalls(state, '/api/games/session/start')[0].at, 'Desktop art is captured before departure');
    rendered(visual.scene); town(visual.scene.gameplay);
    assert.equal(visual.scene.id, active[0].id);
    const viewport = index === 11 ? { width: 390, height: 844 } : { width: 1280, height: 900 };
    assert.deepEqual(visual.viewport, viewport);
    assert(visual.documentWidth > 0 && visual.documentWidth <= viewport.width, 'No horizontal document overflow');
    const canvas = visual.canvas;
    assert(canvas.width > 0 && canvas.height > 0 && canvas.pixelWidth > 0 && canvas.pixelHeight > 0, 'A real nonempty canvas is required');
    assert(canvas.x >= -1 && canvas.x + canvas.width <= viewport.width + 1, 'Canvas fits the current viewport horizontally');
    if (index === 11) {
      const geometry = visual.scene.gameplay.viewportGeometry;
      empty(phoneGeometryIssues(geometry), 'Phone HUD, controls, hero and full shop must fit their rendered unobstructed regions');
      assert.equal(geometry.canvas.width, canvas.width); assert.equal(geometry.canvas.height, canvas.height);
    }
    empty(townGroundIssues(visual.scene.gameplay), 'Continuous town ground and original entrance position required');
    const art = visual.scene.gameplay.townArt;
    assert(art); assert.deepEqual(art.objects.map(item => item.key).sort(), ['town_ground_plane_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1', 'town_ruins_entrance_v1'].sort());
    const shop = art.objects.find(item => item.key === 'town_corner_shop_v1');
    const floor = art.objects.find(item => item.key === 'town_ground_plane_v1');
    const lantern = art.objects.find(item => item.key === 'town_corner_lantern_v1');
    for (const object of [art.hero, ...art.objects]) {
      for (const key of ['x', 'y', 'depth', 'originX', 'originY', 'scaleX', 'scaleY', 'displayWidth', 'displayHeight']) assert(Number.isFinite(object[key]));
      assert(object.scaleX > 0 && object.scaleY > 0);
    }
    assert.equal(shop.originX, 618 / 1254); assert.equal(shop.originY, 1175 / 1254);
    assert.equal(shop.depth, shop.y + 20); assert.equal(lantern.depth, lantern.y + 20);
    assert.equal(art.hero.depth, art.hero.y + 20);
    assert(floor.depth < Math.min(shop.depth, lantern.depth, art.hero.depth), 'Ground art remains beneath actors and props');
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
      empty(townGroundIssues(point.scene.gameplay), 'Returned town rebuilds the continuous ground and entrance exactly once');
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
