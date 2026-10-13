import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('phaser', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const Circle = require('phaser/src/geom/circle/Circle.js');
  Circle.Contains = require('phaser/src/geom/circle/Contains.js');
  return { default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
    Math: { Vector2: require('phaser/src/math/Vector2.js') },
    Geom: { Circle },
    Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }
  } };
});
import { GameScene } from '../games/arpg/scenes/GameScene';
import { World } from '../games/arpg/ecs/components';
import { advanceArea, collectGold, createExpedition, enterRuins, recordKill, returnToTown } from '../games/arpg/expedition';
const require = createRequire(import.meta.url);
const Clock = require('phaser/src/time/Clock.js');
afterEach(() => { vi.restoreAllMocks(); });

function fixture(enemyY = 110) {
  let current = true;
  const onGameOver = vi.fn();
  const s: any = new GameScene({ isCurrent: () => current, onReady() {}, onError() {}, onGameOver });
  s.events = new EventEmitter();
  s.cameras = { main: { setBackgroundColor() { throw new Error('stop after lifecycle registration'); } } };
  expect(() => s.initializeScene()).toThrow('stop after lifecycle registration');
  s.world = new World(); s.playerId = s.world.createEntity();
  s.world.setTransform(s.playerId, { x: 0, y: 0, rot: 0 });
  s.world.setHealth(s.playerId, { current: 140, max: 140 });
  s.world.tagPlayer(s.playerId, { score: 0 });
  s.expedition = enterRuins(createExpedition()); s.runState = 'running'; s.initialized = true;
  s.expeditionActive = true; s.expeditionStartedAt = performance.now();
  s.sys = { events: s.events }; s.time = new Clock(s);
  s.playerSprite = Object.assign(new EventEmitter(), {
    play: vi.fn(), anims: { pause: vi.fn(), resume: vi.fn() }
  });
  s.updateControlButtons = vi.fn(); s.createSwooshEffect = vi.fn();
  // Keep the actual update / area-change / completion orchestration; stub renderer and input work.
  for (const method of ['handleInput', 'handleDash', 'resolveCollisions', 'syncSprites', 'updateEnemyBehavior',
    'updateLootCollection', 'updateUIState', 'updateFixedUITransforms', 'updateTownCamera', 'buildDungeonRoom',
    'buildAreaContent', 'resizeVignette']) s[method] = vi.fn();
  s.captureTransforms = () => new Map();
  s.worldLayer = { list: [] }; s.tweens = { killAll: vi.fn() };
  s.setupPlayer = () => { s.playerId = s.world.createEntity(); };
  const id = s.world.createEntity();
  s.world.setTransform(id, { x: 0, y: enemyY, rot: 0 });
  s.world.setHealth(id, { current: 45, max: 45 });
  const enemyHealth = s.world.getHealth(id);
  const enemySprite = { setTintFill: vi.fn(), clearTint: vi.fn(), anims: { pause: vi.fn(), resume: vi.fn() } };
  s.skeletons = [{ id, alive: true, sprite: enemySprite }];
  return { s, enemyHealth, enemySprite, onGameOver, cancelOwner: () => { current = false; } };
}
const stepClock = (s: any, ms: number) => { s.time.preUpdate(); s.time.update(s.time.now + ms, ms); };

// Real Phaser Clock/TimerEvent and game methods; renderer/animation collaborators are mocked.
describe('paused sword hit remaining-delay and cancellation regression', () => {
  it('keeps uninterrupted damage, 140 ms impact timing and 320 ms cooldown', () => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); expect(s.attackCooldown).toBe(320);
    stepClock(s, 139); expect(enemyHealth.current).toBe(45);
    stepClock(s, 1); expect(enemyHealth.current).toBe(13);
    expect(s.pendingAttackHit).toBeUndefined();
    stepClock(s, 1000); expect(enemyHealth.current).toBe(13);
    expect(s.createSwooshEffect).toHaveBeenCalledOnce();
  });
  it('preserves the remaining impact delay and gameplay cooldown through pause/resume', () => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); stepClock(s, 70); s.update(0, 70);
    expect(s.attackCooldown).toBe(250);
    s.pauseGameplay(); stepClock(s, 1000); s.update(0, 1000);
    expect(s.pendingAttackHit.getRemaining()).toBe(70);
    expect(s.attackCooldown).toBe(250); expect(enemyHealth.current).toBe(45);
    expect(s.time.paused).toBe(false);
    s.resumeGameplay(); stepClock(s, 69); s.update(0, 69);
    expect(enemyHealth.current).toBe(45); expect(s.attackCooldown).toBe(181);
    stepClock(s, 1); s.update(0, 1);
    expect(enemyHealth.current).toBe(13); expect(s.attackCooldown).toBe(180);
    expect(s.createSwooshEffect).toHaveBeenCalledOnce();
  });
  it('does not count paused time toward an impact that has not yet become due', () => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); stepClock(s, 20); s.pauseGameplay(); stepClock(s, 100);
    expect(s.pendingAttackHit.getRemaining()).toBe(120);
    s.resumeGameplay(); stepClock(s, 30);
    expect(enemyHealth.current).toBe(45); expect(s.pendingAttackHit.getRemaining()).toBe(90);
    stepClock(s, 90); expect(enemyHealth.current).toBe(13);
    expect(s.createSwooshEffect).toHaveBeenCalledOnce();
  });
  it('also pauses a hit before its first Clock preUpdate insertion', () => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); s.pauseGameplay(); stepClock(s, 500);
    expect(s.pendingAttackHit.getRemaining()).toBe(140);
    s.resumeGameplay(); stepClock(s, 140); expect(enemyHealth.current).toBe(13);
  });
  it('repeated pause/resume and stale callback invocation cannot duplicate an impact', () => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); const callback = s.pendingAttackHit.callback;
    for (let i = 0; i < 2; i++) {
      stepClock(s, 35); s.pauseGameplay(); s.pauseGameplay(); stepClock(s, 500);
      s.resumeGameplay(); s.resumeGameplay();
    }
    stepClock(s, 70); expect(enemyHealth.current).toBe(13);
    callback(); s.pauseGameplay(); s.resumeGameplay(); stepClock(s, 1000);
    expect(enemyHealth.current).toBe(13); expect(s.createSwooshEffect).toHaveBeenCalledOnce();
    s.performAttack(); const newHit = s.pendingAttackHit; callback();
    expect(s.pendingAttackHit).toBe(newHit);
    stepClock(s, 140); expect(enemyHealth.current).toBe(0);
    expect(s.createSwooshEffect).toHaveBeenCalledTimes(2);
  });
  it.each(['pending insertion', 'paused active'])('return cancels a hit during %s without damage or duplicate completion', state => {
    const { s, enemyHealth, onGameOver } = fixture();
    s.expedition = collectGold(s.expedition); s.performAttack();
    const callback = s.pendingAttackHit.callback;
    if (state === 'paused active') { stepClock(s, 70); s.pauseGameplay(); }
    s.handleReturnControl(); callback(); stepClock(s, 500);
    expect(s.pendingAttackHit).toBeUndefined(); expect(enemyHealth.current).toBe(45);
    expect(s.expedition).toMatchObject({ area: 0, outcome: 'retreated', bankedGold: 1 });
    expect(onGameOver).toHaveBeenCalledOnce(); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it('descending cancels the previous floor hit and allows a new floor hit', () => {
    const { s, enemyHealth } = fixture();
    for (let i = 0; i < 4; i++) s.expedition = recordKill(s.expedition);
    s.performAttack(); const callback = s.pendingAttackHit.callback;
    stepClock(s, 70); s.pauseGameplay(); s.changeArea(advanceArea(s.expedition));
    callback(); stepClock(s, 500);
    expect(s.expedition.area).toBe(2); expect(enemyHealth.current).toBe(45);
    expect(s.pendingAttackHit).toBeUndefined(); expect(s.runState).toBe('running');
    expect(s.time.paused).toBe(false);
    s.world.setTransform(s.playerId, { x: 0, y: 0, rot: 0 });
    s.performAttack(); stepClock(s, 140); expect(s.createSwooshEffect).toHaveBeenCalledOnce();
  });
  it.each(['shutdown', 'destroy'])('%s cancels paused hits and invalidates captured callbacks', event => {
    const { s, enemyHealth } = fixture();
    s.performAttack(); const callback = s.pendingAttackHit.callback;
    stepClock(s, 70); s.pauseGameplay(); s.events.emit(event);
    s.resumeGameplay(); callback(); stepClock(s, 1000);
    expect(s.pendingAttackHit).toBeUndefined(); expect(enemyHealth.current).toBe(45);
    expect(s.createSwooshEffect).not.toHaveBeenCalled();
    expect(s.events.listenerCount('shutdown')).toBe(0);
    expect(s.events.listenerCount('destroy')).toBe(0);
  });
  it('owner cancellation suppresses a resumed impact before deferred scene teardown', () => {
    const { s, enemyHealth, cancelOwner } = fixture();
    s.performAttack(); stepClock(s, 70); s.pauseGameplay(); cancelOwner();
    s.resumeGameplay(); stepClock(s, 70);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it('death suppresses a resumed impact before the next gameplay update rescues the hero', () => {
    const { s, enemyHealth, onGameOver } = fixture();
    s.expedition = collectGold(s.expedition); s.performAttack();
    stepClock(s, 70); s.pauseGameplay(); s.world.getHealth(s.playerId).current = 0;
    s.resumeGameplay(); stepClock(s, 70);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
    s.update(0, 16);
    expect(s.expedition).toMatchObject({ area: 0, outcome: 'rescued', bankedGold: 0, carriedGold: 0 });
    expect(onGameOver).toHaveBeenCalledOnce();
  });
  it('90-second wall-clock expiry still rescues during pause and cancels the held impact', () => {
    const { s, enemyHealth, onGameOver } = fixture();
    const now = vi.spyOn(performance, 'now').mockReturnValue(89900);
    s.expeditionStartedAt = 0; s.expedition = collectGold(s.expedition);
    s.performAttack(); const callback = s.pendingAttackHit.callback;
    stepClock(s, 70); s.pauseGameplay(); now.mockReturnValue(90000);
    stepClock(s, 100); s.update(0, 100); callback();
    expect(s.expedition).toMatchObject({ area: 0, outcome: 'rescued', bankedGold: 0 });
    expect(s.pendingAttackHit).toBeUndefined(); expect(enemyHealth.current).toBe(45);
    expect(onGameOver.mock.calls).toEqual([[0, 90000]]);
  });
  it('an expired resumed impact is rejected before the next gameplay frame', () => {
    const { s, enemyHealth } = fixture();
    const now = vi.spyOn(performance, 'now').mockReturnValue(89900); s.expeditionStartedAt = 0;
    s.performAttack(); stepClock(s, 70); s.pauseGameplay(); now.mockReturnValue(90000);
    s.resumeGameplay(); stepClock(s, 70);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it.each([[195, 13], [195.001, 45]])('keeps the existing 110px center offset / 85px radius at y=%s', (y, hp) => {
    const { s, enemyHealth } = fixture(y);
    s.performAttack(); stepClock(s, 70); s.pauseGameplay(); stepClock(s, 500);
    s.resumeGameplay(); stepClock(s, 70); expect(enemyHealth.current).toBe(hp);
  });
  it('does not freeze unrelated 120 ms tint-reset timers', () => {
    const { s, enemySprite } = fixture();
    s.performAttack(); stepClock(s, 140); s.pauseGameplay(); stepClock(s, 120);
    expect(enemySprite.clearTint).toHaveBeenCalledOnce(); expect(s.time.paused).toBe(false);
  });
});

// Combined combat/objective lifecycle regressions. The original17 pause cases above remain unchanged.
describe('combined held-hit and objective-observer teardown', () => {
  it.each(['shutdown', 'destroy'])('%s invalidates both features and listeners before reentrant outward cleanup', event => {
    const { s, enemyHealth } = fixture();
    const observations: any[] = [];
    const cleanupSnapshots: any[] = [];
    let staleHit: () => void;
    const epoch = s.objectiveObserverEpoch;
    s.objectiveObserverActive = true;
    s.handlers.onExpeditionProgress = (progress: unknown) => {
      observations.push(progress);
      if (progress !== null) return;
      // Assert this snapshot outside the observer: presentation callbacks intentionally swallow errors.
      cleanupSnapshots.push({ pendingHit: s.pendingAttackHit, active: s.objectiveObserverActive,
        key: s.objectiveProgressKey, epoch: s.objectiveObserverEpoch,
        shutdownListeners: s.events.listenerCount('shutdown'), destroyListeners: s.events.listenerCount('destroy') });
      // A public observer can synchronously trigger another lifecycle event.
      s.events.emit(event === 'shutdown' ? 'destroy' : 'shutdown');
      s.expedition = recordKill(s.expedition); s.publishExpeditionProgress(); staleHit();
    };
    s.publishExpeditionProgress(); s.performAttack(); staleHit = s.pendingAttackHit.callback;
    stepClock(s, 70); s.pauseGameplay();
    const scenery = { destroy: vi.fn(() => {
      s.events.emit('shutdown'); s.events.emit('destroy'); staleHit(); s.publishExpeditionProgress();
    }) };
    s.townCorner = scenery;
    s.events.emit(event); s.resumeGameplay(); stepClock(s, 1000); staleHit();
    expect(observations).toEqual([{ area: 1, floorKills: 0, outcome: 'exploring' }, null]);
    expect(cleanupSnapshots).toEqual([{ pendingHit: undefined, active: false, key: null,
      epoch: epoch + 1, shutdownListeners: 0, destroyListeners: 0 }]);
    expect(scenery.destroy).toHaveBeenCalledOnce(); expect(s.townCorner).toBeNull();
    expect(s.objectiveObserverEpoch).toBe(epoch + 1);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it.each(['shutdown', 'destroy'])('%s finishes internal invalidation and scenery cleanup when the null observer throws', event => {
    const { s, enemyHealth } = fixture();
    const observer = vi.fn(() => { throw new Error('optional objective view failed'); });
    s.handlers.onExpeditionProgress = observer; s.objectiveObserverActive = true;
    s.performAttack(); const staleHit = s.pendingAttackHit.callback; stepClock(s, 70); s.pauseGameplay();
    const scenery = { destroy: vi.fn() }; s.townCorner = scenery;
    expect(() => s.events.emit(event)).not.toThrow();
    s.events.emit('shutdown'); s.events.emit('destroy'); s.publishExpeditionProgress(); staleHit();
    expect(observer.mock.calls).toEqual([[null]]); expect(scenery.destroy).toHaveBeenCalledOnce();
    expect(s.pendingAttackHit).toBeUndefined(); expect(s.objectiveObserverActive).toBe(false);
    expect(s.events.listenerCount('shutdown')).toBe(0); expect(s.events.listenerCount('destroy')).toBe(0);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it.each(['shutdown', 'destroy'])('%s still clears both features after owner cancellation suppresses outward notification', event => {
    const { s, enemyHealth, cancelOwner } = fixture();
    s.handlers.onExpeditionProgress = vi.fn(); s.objectiveObserverActive = true;
    s.performAttack(); const staleHit = s.pendingAttackHit.callback; stepClock(s, 70); s.pauseGameplay();
    cancelOwner(); s.events.emit(event); s.resumeGameplay(); stepClock(s, 1000); staleHit(); s.publishExpeditionProgress();
    expect(s.handlers.onExpeditionProgress).not.toHaveBeenCalled(); expect(s.pendingAttackHit).toBeUndefined();
    expect(s.objectiveObserverActive).toBe(false); expect(s.objectiveProgressKey).toBeNull();
    expect(s.events.listenerCount('shutdown')).toBe(0); expect(s.events.listenerCount('destroy')).toBe(0);
    expect(enemyHealth.current).toBe(45); expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
});
