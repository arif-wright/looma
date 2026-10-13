import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('phaser', async () => {
  const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url);
  return { default: { Scene: class {},
    Math: { Vector2: require('phaser/src/math/Vector2.js'), Linear: (a: number, b: number, t: number) => a + (b - a) * t,
      Distance: { Between: (x: number, y: number, a: number, b: number) => Math.hypot(x - a, y - b) } },
    Animations: { Events: require('phaser/src/animations/events/index.js') },
    Scenes: { Events: require('phaser/src/scene/events/index.js') }
  } };
});
import { GameScene } from '../games/arpg/scenes/GameScene';
import { World } from '../games/arpg/ecs/components';
import { movementSystem } from '../games/arpg/ecs/systems';
import { createExpedition, enterRuins, returnToTown } from '../games/arpg/expedition';
import { SKELETON_MANIFEST } from '../games/arpg/assets/manifest';
const require = createRequire(import.meta.url);
const Emitter = require('eventemitter3');
const Animation = require('phaser/src/animations/Animation.js');
const AnimationState = require('phaser/src/animations/AnimationState.js');
const key = (state: 'idle' | 'walk' | 'attack' | 'death', facing = 'S') => `skeleton-skeleton_${state === 'death' ? 'special' : 'default'}_${state}-${facing}`;
const actors: any[] = [];
afterEach(() => { for (const actor of actors.splice(0)) if (actor.anims.parent) actor.destroy(); vi.restoreAllMocks(); });

function fixture() {
  let current = true;
  const s: any = new GameScene({ isCurrent: () => current, onReady() {}, onError() {}, onGameOver: vi.fn() });
  s.world = new World(); s.playerId = s.world.createEntity();
  s.world.setTransform(s.playerId, { x: 0, y: 0, rot: 0 });
  s.world.setVelocity(s.playerId, { vx: 0, vy: 0, speed: 220 });
  s.world.setHealth(s.playerId, { max: 140, current: 140 }); s.world.tagPlayer(s.playerId, { score: 0 });
  s.expedition = enterRuins(createExpedition()); s.runState = 'running'; s.initialized = true;
  s.expeditionActive = true; s.expeditionStartedAt = performance.now();
  const animations = new Map();
  const manager: any = Object.assign(new Emitter(), { globalTimeScale: 1, getMix: () => 0,
    textureManager: { getFrame: (textureKey: string) => ({ texture: { key: textureKey } }) },
    exists: (name: string) => animations.has(name), get: (name: string) => animations.get(name),
    create: (config: any) => { const anim = new Animation(manager, config.key, config); animations.set(config.key, anim); return anim; }
  });
  s.anims = manager; s.sys = { anims: manager }; s.events = new Emitter();
  const visual = () => {
    const object: any = { scaleX: 1, destroy: vi.fn() };
    for (const name of ['setPosition', 'setDepth', 'setScale', 'setOrigin', 'setAlpha']) object[name] = vi.fn(() => object);
    return object;
  };
  const actor = () => {
    const object: any = Object.assign(new Emitter(), visual(), { scene: s, active: true, setSizeToFrame() {} });
    object.anims = new AnimationState(object);
    object.play = vi.fn((name: string) => object.anims.play(name));
    object.destroy = vi.fn(() => { if (object.anims.parent) object.anims.destroy(); object.removeAllListeners(); object.active = false; });
    actors.push(object); return object;
  };
  s.playerSprite = actor(); s.playerShadow = visual(); s.heroRing = visual();
  s.worldLayer = { list: [] }; s.addToWorld = (object: any) => { s.worldLayer.list.push(object); return object; };
  s.add = { sprite: actor, image: visual };
  s.registerCharacterAnimations('skeleton', SKELETON_MANIFEST); s.spawnSkeleton(4, 3);
  const enemy = s.skeletons[0], sprite = enemy.sprite;
  s.world.setTransform(enemy.id, { x: 100, y: 0, rot: 0 });
  for (const name of ['updateControlButtons', 'updateUIState', 'updateFixedUITransforms', 'updateTownCamera', 'handleInput',
    'handleDash', 'resolveCollisions', 'updateLootCollection', 'buildDungeonRoom', 'buildAreaContent', 'resizeVignette']) s[name] = vi.fn();
  s.time = { removeAllEvents: vi.fn(), clearPendingEvents: vi.fn() }; s.tweens = { killAll: vi.fn() };
  s.setupPlayer = () => { s.playerId = s.world.createEntity(); s.playerSprite = actor(); };
  sprite.play.mockClear();
  return { s, enemy, sprite, setVelocity: (vx: number, vy = 0) => { s.world.setVelocity(enemy.id, { vx, vy, speed: 135 }); }, cancelOwner: () => { current = false; } };
}
const tickAnimation = (sprite: any, ms: number) => { for (let t = 0; t < ms; t += 10) sprite.anims.update(t, Math.min(10, ms - t)); };

describe('warden locomotion transitions with actual Phaser Animation/AnimationState', () => {
  it('switches spawned idle into a walking loop while actual ECS movement preserves speed', () => {
    const { s, enemy, sprite, setVelocity } = fixture();
    expect(sprite.anims.currentAnim.key).toBe(key('idle')); expect(sprite.anims.isPlaying).toBe(true);
    setVelocity(135); movementSystem(s.world, 16); s.syncSprites();
    expect(s.world.getTransform(enemy.id).x).toBeCloseTo(102.16);
    expect(sprite.anims.currentAnim.key).toBe(key('walk', 'E')); expect(sprite.anims.repeat).toBe(-1);
    expect(sprite.play).toHaveBeenCalledOnce();
  });
  it.each([[135, 0, 'E'], [-135, 0, 'W'], [0, -135, 'N'], [0, 135, 'S']])('changes a playing loop for velocity %s,%s to %s', (vx, vy, dir) => {
    const { s, sprite, setVelocity } = fixture();
    setVelocity(vx as number, vy as number); s.syncSprites();
    expect(sprite.anims.currentAnim.key).toBe(key('walk', dir as string));
    setVelocity(-(vx as number), -(vy as number)); s.syncSprites();
    expect(sprite.play).toHaveBeenCalledTimes(2);
  });
  it('turns and stops in the current direction without restarting identical-key frames', () => {
    const { s, sprite, setVelocity } = fixture();
    setVelocity(135); s.syncSprites(); tickAnimation(sprite, 250);
    const frame = sprite.anims.currentFrame, accumulator = sprite.anims.accumulator;
    for (let i = 0; i < 8; i++) s.syncSprites();
    expect(sprite.play).toHaveBeenCalledOnce(); expect(sprite.anims.currentFrame).toBe(frame);
    expect(sprite.anims.accumulator).toBe(accumulator);
    setVelocity(-135); s.syncSprites(); expect(sprite.anims.currentAnim.key).toBe(key('walk', 'W'));
    setVelocity(0); s.syncSprites(); expect(sprite.anims.currentAnim.key).toBe(key('idle', 'W'));
    s.syncSprites(); expect(sprite.play).toHaveBeenCalledTimes(3);
  });
  it.each(['idle', 'walk', 'attack'] as const)('retains paused %s frame/state through direct sync and ordinary paused updates', state => {
    const { s, sprite, setVelocity } = fixture();
    sprite.play(key(state)); tickAnimation(sprite, 100); s.pauseGameplay(); setVelocity(135);
    const frame = sprite.anims.currentFrame, accumulator = sprite.anims.accumulator, count = sprite.play.mock.calls.length;
    s.syncSprites(); tickAnimation(sprite, 1000); s.update(0, 16);
    expect(sprite.anims.isPaused).toBe(true); expect(sprite.anims.currentFrame).toBe(frame);
    expect(sprite.anims.accumulator).toBe(accumulator); expect(sprite.play).toHaveBeenCalledTimes(count);
    s.resumeGameplay(); s.syncSprites();
    expect(sprite.anims.isPaused).toBe(false);
    expect(sprite.anims.currentAnim.key).toBe(key(state === 'attack' ? 'attack' : 'walk', state === 'attack' ? 'S' : 'E'));
  });
  it('does not interrupt attack, preserves one completion-driven12HP hit, then follows current facing', () => {
    const { s, enemy, sprite, setVelocity } = fixture();
    s.world.setTransform(enemy.id, { x: 50, y: 0, rot: 0 }); s.updateEnemyBehavior(16);
    expect(sprite.anims.currentAnim.key).toBe(key('attack', 'W'));
    const frame = sprite.anims.currentFrame, starts = sprite.play.mock.calls.length;
    setVelocity(135); s.syncSprites(); expect(sprite.play).toHaveBeenCalledTimes(starts);
    expect(sprite.anims.currentFrame).toBe(frame);
    tickAnimation(sprite, 570); expect(s.world.getHealth(s.playerId).current).toBe(140);
    tickAnimation(sprite, 10); expect(s.world.getHealth(s.playerId).current).toBe(128);
    expect(sprite.anims.isPlaying).toBe(false); s.syncSprites();
    expect(sprite.anims.currentAnim.key).toBe(key('walk', 'E'));
    tickAnimation(sprite, 1000); expect(s.world.getHealth(s.playerId).current).toBe(128);
    expect(enemy.attackTimer).toBe(1050);
  });
  it('retains death animation and suppresses a pending attack callback from a killed enemy', () => {
    const { s, enemy, sprite, setVelocity } = fixture();
    s.world.setTransform(enemy.id, { x: 50, y: 0, rot: 0 }); s.updateEnemyBehavior(16);
    s.world.getHealth(enemy.id).current = 0; s.updateEnemyBehavior(16);
    expect(enemy.alive).toBe(false); expect(sprite.anims.currentAnim.key).toBe(key('death', 'W'));
    const count = sprite.play.mock.calls.length; s.syncSprites(); expect(sprite.play).toHaveBeenCalledTimes(count);
    tickAnimation(sprite, 700);
    expect(sprite.destroy).toHaveBeenCalledOnce(); expect(s.world.getHealth(s.playerId).current).toBe(140);
    expect(s.expedition).toMatchObject({ kills: 1, xp: 25 });
  });
  it('area teardown destroys old animation state and ownership cancellation prevents further sync', () => {
    const { s, sprite, setVelocity, cancelOwner } = fixture();
    setVelocity(135); s.syncSprites(); s.changeArea(returnToTown(s.expedition));
    expect(sprite.destroy).toHaveBeenCalledOnce(); expect(sprite.anims.parent).toBeNull();
    expect(sprite.anims.currentAnim).toBeNull(); expect(s.skeletons).toHaveLength(0);
    cancelOwner(); expect(() => s.update(0, 16)).not.toThrow();
    expect(sprite.play).toHaveBeenCalledOnce();
  });
});
