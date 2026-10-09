import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

// Exercise the actual inline fixture logic with a deterministic scene-update
// boundary. These stubs test fixture ordering, not Phaser rendering or gameplay.
const fixturePath = process.env.WILDS_FIXTURE_HTML ?? fileURLToPath(new URL('./index.html', import.meta.url));
const html = readFileSync(fixturePath, 'utf8');
const moduleBody = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(moduleBody, 'Expected the real inline fixture module');
const source = moduleBody.replace(/^import .*;\r?\n/gm, '');

function harness() {
  let interval;
  let intervalActive = false;
  let onPagehide;
  const buttons = new Map(['grove', 'hollow'].map(id => [id, { onclick: null, click() { this.onclick?.(); } }]));
  class Scene {
    events = new EventEmitter();
    applied = [];
    setConnectionActive() {}
    setMovementSender() {}
    setPortalHandlers(sender) { this.portalSender = sender; }
    applyNetworkSnapshot(snapshot) { this.latest = snapshot; this.applied.push(snapshot); }
  }
  class Game {
    canvas = { dataset: {} };
    destroyed = false;
    destroy() { this.destroyed = true; }
  }
  const window = { addEventListener(name, listener) { assert.equal(name, 'pagehide'); onPagehide = listener; } };
  runInNewContext(source, {
    WorldScene: Scene,
    Phaser: { Game, AUTO: 0, Scale: { FIT: 0, CENTER_BOTH: 0 }, Scenes: { Events: { POST_UPDATE: 'postupdate' } } },
    document: { getElementById(id) { return buttons.get(id); } }, window,
    setInterval(callback, delay) { assert.equal(delay, 100); interval = callback; intervalActive = true; return 1; },
    clearInterval(id) { assert.equal(id, 1); intervalActive = false; }
  });
  const fixture = window.__WILDS_FIXTURE__;
  const local = () => fixture.scene.latest.players.get('local');
  const publishSceneUpdate = (nextX = local().x, nextY = local().y) => {
    // Model only WorldScene.update's existing telemetry publication before
    // Phaser Systems.step emits POST_UPDATE. Never modify the real renderer.
    fixture.game.canvas.dataset.localPlayerX = nextX.toFixed(2);
    fixture.game.canvas.dataset.localPlayerY = nextY.toFixed(2);
    fixture.scene.events.emit('postupdate');
  };
  publishSceneUpdate();
  return { fixture, local, publishSceneUpdate, tick: () => { assert.ok(intervalActive); interval(); },
    pagehide: () => onPagehide(), intervalActive: () => intervalActive };
}

test('explicit placement survives stale timer readback and then resumes movement feedback', () => {
  const h = harness();
  h.fixture.putLocal(880, 270);
  h.publishSceneUpdate();
  h.fixture.putLocal(440, 270);
  assert.equal(h.fixture.game.canvas.dataset.localPlayerX, '880.00', 'Placement must not fabricate renderer telemetry');
  const tickBefore = h.fixture.scene.latest.tick;
  h.tick(); // Deliberately before the next real scene-update boundary.
  assert.equal(h.local().x, 440, 'Stale canvas coordinates must not replace explicit snapshot');
  assert.equal(h.fixture.scene.latest.tick, tickBefore + 1, 'Resident snapshot clock must continue');
  h.publishSceneUpdate(446, 270); // Legitimate movement can occur in that update.
  h.tick();
  assert.equal(h.local().x, 446, 'Normal movement feedback must resume after update');
});

test('area button placement cannot echo coordinates from the prior area', () => {
  const h = harness();
  h.fixture.putLocal(880, 270); h.publishSceneUpdate();
  h.fixture.switchArea('hollow'); h.tick();
  assert.equal(h.local().mapId, 'wilds-town');
  assert.equal(h.local().x, 440);
  h.publishSceneUpdate(447, 270); h.tick();
  assert.equal(h.local().x, 447);
});

test('fixture portal placement retains destination spawn until scene update', () => {
  const h = harness();
  h.fixture.putLocal(880, 270); h.publishSceneUpdate();
  h.fixture.scene.portalSender(); h.tick();
  assert.equal(h.local().mapId, 'wilds-town');
  assert.equal(h.local().x, 160);
  h.publishSceneUpdate();
  h.fixture.scene.portalSender(); h.tick();
  assert.equal(h.local().mapId, 'wilds-exploration');
  assert.equal(h.local().x, 804);
});

test('a stale prior acknowledgement cannot release a newer placement', () => {
  const h = harness();
  h.fixture.putLocal(880, 270);
  const earlier = h.fixture.scene.events.listeners('postupdate')[0];
  assert.equal(typeof earlier, 'function');
  h.fixture.putLocal(450, 270);
  earlier(); // Model a previously captured callback completing after replacement.
  h.tick();
  assert.equal(h.local().x, 450);
  assert.equal(h.fixture.scene.events.listenerCount('postupdate'), 1);
  h.publishSceneUpdate(455, 270); h.tick();
  assert.equal(h.local().x, 455);
  assert.equal(h.fixture.scene.events.listenerCount('postupdate'), 0);
});

test('replacement and pagehide clean up pending acknowledgement callbacks', () => {
  const h = harness();
  for (let i = 0; i < 50; i++) h.fixture.putLocal(440 + i, 270);
  assert.equal(h.fixture.scene.events.listenerCount('postupdate'), 1);
  h.pagehide();
  assert.equal(h.fixture.scene.events.listenerCount('postupdate'), 0);
  assert.equal(h.intervalActive(), false);
  assert.equal(h.fixture.game.destroyed, true);
});
