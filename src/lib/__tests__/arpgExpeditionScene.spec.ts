import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  Scene: class {},
  Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  BlendModes: { NORMAL: 'normal', MULTIPLY: 'multiply', ADD: 'add' },
  Math: { Vector2: class { constructor(public x = 0, public y = 0) {} }, Between: (min: number) => min, Linear: (start: number, end: number, amount: number) => start + (end - start) * amount, Distance: { Between: (x: number, y: number, a: number, b: number) => Math.hypot(x - a, y - b) } },
  Input: { Keyboard: { JustDown: () => false } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }
} }));
import { GameScene } from '../games/arpg/scenes/GameScene';
import { World } from '../games/arpg/ecs/components';
import { createTownSession } from '../games/arpg/townSession';
import { createExpedition, enterRuins, recordKill, AREAS } from '../games/arpg/expedition';
const make = () => {
  const scene = new GameScene({ isCurrent: () => true, onReady: vi.fn(), onError: vi.fn(), onGameOver: vi.fn() });
  // Runtime access exercises private behavior without substituting a second state machine.
  return scene as any;
};
describe('ARPG scene expedition wiring (renderer mocked)', () => {
  it('requests departure without entering before session authorization', () => {
    const s = make(); s.changeArea = vi.fn();
    s.handlers.onDepartureRequested = vi.fn();
    s.handlePrimaryControl();
    expect(s.handlers.onDepartureRequested).toHaveBeenCalledOnce();
    expect(s.changeArea).not.toHaveBeenCalled();
  });
  it('does not let the gate skip enemies, and descends after clearing floor one', () => {
    const s = make(); s.expedition = enterRuins(createExpedition());
    s.runState = 'running'; s.pauseGameplay = vi.fn(); s.changeArea = vi.fn();
    s.handlePrimaryControl();
    expect(s.pauseGameplay).toHaveBeenCalledOnce();
    expect(s.changeArea).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) s.expedition = recordKill(s.expedition);
    s.handlePrimaryControl();
    expect(s.changeArea.mock.calls[0][0].area).toBe(2);
  });
  it('returns to town before ending, preserving a summary to read', () => {
    const s = make(); s.expedition = enterRuins(createExpedition());
    s.changeArea = vi.fn(); s.endRun = vi.fn();
    s.handleReturnControl();
    expect(s.changeArea.mock.calls[0][0]).toMatchObject({ area: 0, outcome: 'retreated' });
    expect(s.endRun).not.toHaveBeenCalled();
  });
  it('disables damage callbacks in town, pause, and after session completion', () => {
    const s = make(); s.playerId = 1; s.runState = 'running';
    s.createSwooshEffect = vi.fn();
    s.applyAttackHit({}, {});
    s.expedition = enterRuins(createExpedition()); s.runState = 'paused';
    s.applyAttackHit({}, {});
    s.runState = 'running'; s.ended = true; s.applyAttackHit({}, {});
    expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });
  it('uses registered texture keys and changes room obstacles across floors', () => {
    const counts: number[] = [];
    for (let area = 0; area < AREAS.length; area++) {
      const s = make(); s.expedition.area = area;
      const image = { setScale: vi.fn(), setTint: vi.fn(), setDepth: vi.fn() };
      s.add = { image: vi.fn(() => image) }; s.addToWorld = vi.fn();
      s.cameras = { main: { setZoom: vi.fn(), setBounds: vi.fn() } };
      s.buildDungeonRoom();
      expect(s.add.image.mock.calls.every((args: any[]) => /^(floor|wall)_\d$/.test(args[2]))).toBe(true);
      counts.push(s.wallTiles.size);
    }
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
  });
  it.each([0, 1, 2])('keeps every floor tile below markers and actors on area %s while preserving wall depth', (area) => {
    const s = make(); s.expedition.area = area; s.world = new World();
    const objects: any[] = [];
    const object = (kind: string, x: number, y: number, texture?: string) => {
      const value: any = { kind, x, y, texture, depth: 0, scaleX: 1 };
      for (const method of ['setScale', 'setTint', 'setAlpha', 'setOrigin', 'setBlendMode', 'play']) {
        value[method] = vi.fn(() => value);
      }
      value.setDepth = vi.fn((depth: number) => { value.depth = depth; return value; });
      value.setPosition = vi.fn((nextX: number, nextY: number) => { value.x = nextX; value.y = nextY; return value; });
      objects.push(value); return value;
    };
    s.add = {
      image: (x: number, y: number, key: string) => object('image', x, y, key),
      sprite: (x: number, y: number, key: string) => object('sprite', x, y, key),
      ellipse: vi.fn((x: number, y: number) => object('ellipse', x, y)),
      text: (x: number, y: number) => object('text', x, y),
      group: vi.fn()
    };
    s.addToWorld = vi.fn(); s.spawnSkeletons = vi.fn(); s.createProps = vi.fn();
    s.cameras = { main: { setZoom: vi.fn(), setBounds: vi.fn(), startFollow: vi.fn() } };
    const context = Object.fromEntries(['save', 'restore', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'clip', 'drawImage'].map(key => [key, vi.fn()]));
    s.textures = { exists: () => false, createCanvas: () => ({ context, refresh: vi.fn() }), get: () => ({ getSourceImage: () => ({}) }) };
    s.buildDungeonRoom(); s.setupPlayer(); s.buildAreaContent();
    const floors = objects.filter(value => value.texture?.startsWith('floor_'));
    const patch = objects.filter(value => value.texture === 'town_corner_cobble_patch_v1');
    const foreground = objects.filter(value => !value.texture?.startsWith('floor_') && value.texture !== 'town_corner_cobble_patch_v1');
    expect(patch).toHaveLength(area === 0 ? 1 : 0);
    if (patch.length) {
      expect(patch[0].depth).toBeGreaterThan(Math.max(...floors.map(value => value.depth)));
      expect(patch[0].depth).toBeLessThan(Math.min(...foreground.map(value => value.depth)));
    }
    expect(floors.length).toBeGreaterThan(0); expect(foreground.length).toBeGreaterThan(0);
    expect(Math.max(...floors.map(value => value.depth))).toBeLessThan(Math.min(...foreground.map(value => value.depth)));
    const offset = floors[0].depth - floors[0].y;
    expect(offset).toBeLessThan(0);
    expect(floors.every(value => value.depth - value.y === offset)).toBe(true);
    // Wall sprites are placed 42px above their isometric foot position. Their
    // original y sorting remains intact; only the floor plane moves backwards.
    const walls = objects.filter(value => value.texture?.startsWith('wall_'));
    expect(walls.every(value => value.depth === value.y + 42 + 160)).toBe(true);
    expect(s.playerSprite.setOrigin).toHaveBeenCalledWith(0.5, 0.5);
    expect(s.heroRing.setScale).toHaveBeenCalledWith(1.2, 0.8);
    expect(s.add.ellipse).toHaveBeenCalledWith(s.playerSprite.x, s.playerSprite.y, 32, 14, 0x000000, 0.28);
    expect([s.playerShadow.x, s.playerShadow.y]).toEqual([s.playerSprite.x, s.playerSprite.y]);
    expect([s.heroRing.x, s.heroRing.y]).toEqual([s.playerSprite.x, s.playerSprite.y]);
    expect(s.heroRing.setAlpha).toHaveBeenCalledWith(0.75);
    expect(s.heroRing.setBlendMode).toHaveBeenCalledWith('normal');
    expect(s.heroRing.setTint).not.toHaveBeenCalled();
    expect(s.playerShadow.depth).toBeLessThan(s.heroRing.depth);
    expect(s.heroRing.depth).toBeLessThan(s.playerSprite.depth);
    // Keep the same relative ordering when moving to a shallower floor row.
    s.world.setTransform(s.playerId, { x: 1100, y: -100, rot: 0 });
    s.syncSprites();
    expect(s.playerShadow.depth).toBe(-105);
    expect(s.heroRing.depth).toBe(-104);
    expect(s.playerSprite.depth).toBe(-80);
    expect([s.playerShadow.x, s.playerShadow.y]).toEqual([1100, -100]);
    expect([s.heroRing.x, s.heroRing.y]).toEqual([1100, -100]);
  });

  it.each([[0.5, 0.5], [0.3, 0.6]])('copies the hero pivot (%s,%s) into dash afterimages', (originX, originY) => {
    const s = make();
    s.playerSprite = { x: 100, y: 200, depth: 220, scale: 1, originX, originY,
      frame: { texture: { key: 'hero-measured-frame' } } };
    const ghost: any = { destroy: vi.fn() };
    for (const method of ['setOrigin', 'setDepth', 'setScale', 'setBlendMode', 'setAlpha']) {
      ghost[method] = vi.fn(() => ghost);
    }
    s.add = { sprite: vi.fn(() => ghost) }; s.addToWorld = vi.fn();
    s.dashAfterimages = { add: vi.fn() }; s.tweens = { add: vi.fn() };
    s.spawnDashAfterimage();
    expect(s.add.sprite).toHaveBeenCalledWith(100, 200, 'hero-measured-frame');
    expect(ghost.setOrigin).toHaveBeenCalledWith(originX, originY);
    expect(ghost.setScale).toHaveBeenCalledWith(1);
    expect(ghost.setDepth).toHaveBeenCalledWith(219);
  });

  it('uses a lighter town vignette and restores dungeon strength across area changes', () => {
    const s = make();
    s.vignetteSprite = { width: 100, height: 100, setPosition: vi.fn(), setScale: vi.fn(), setAlpha: vi.fn() };
    s.scale = { gameSize: { width: 960, height: 540 } };
    for (const area of [0, 1, 2, 0]) {
      s.expedition.area = area; s.resizeVignette();
    }
    expect(s.vignetteSprite.setAlpha.mock.calls).toEqual([[0.25], [0.65], [0.65], [0.25]]);
  });

  it('checks the actual entity center for collision, rather than x=0', () => {
    const s = make(); s.props = [];
    s.worldToTile = vi.fn(() => ({ tx: 3, ty: 3 }));
    expect(s.isBlocked(100, 200, 10)).toBe(false);
    expect(s.worldToTile.mock.calls).toContainEqual([100, 200]);
    expect(s.worldToTile.mock.calls).not.toContainEqual([0, 200]);
  });
  it('cleans pending world effects and preserves score/health between floors', () => {
    const s = make(); s.world = new World(); s.playerId = s.world.createEntity();
    s.world.tagPlayer(s.playerId, { score: 1200 }); s.world.setHealth(s.playerId, { current: 87, max: 140 });
    s.time = { removeAllEvents: vi.fn(), clearPendingEvents: vi.fn() }; s.tweens = { killAll: vi.fn() };
    const child = { destroy: vi.fn() };
    s.worldLayer = { list: [child] }; s.dashAfterimages = { destroy: vi.fn() };
    s.buildDungeonRoom = vi.fn(); s.buildAreaContent = vi.fn(); s.updateControlButtons = vi.fn(); s.updateUIState = vi.fn();
    s.resizeVignette = vi.fn();
    s.setupPlayer = () => { s.playerId = s.world.createEntity(); };
    const townCorner = { destroy: vi.fn() }; s.townCorner = townCorner;
    s.changeArea(enterRuins(s.expedition));
    expect(townCorner.destroy).toHaveBeenCalledOnce();
    expect(s.townCorner).toBeNull();
    expect(s.time.removeAllEvents).toHaveBeenCalledOnce();
    expect(s.time.clearPendingEvents).toHaveBeenCalledOnce();
    expect(child.destroy).toHaveBeenCalledOnce();
    expect(s.world.getPlayer(s.playerId).score).toBe(1200);
    expect(s.world.getHealth(s.playerId).current).toBe(87);
    expect(s.areaEpoch).toBe(1);
    expect(s.resizeVignette).toHaveBeenCalledOnce();
  });

  it('rolls back a dash that crosses the town shop even when the destination is clear', () => {
    const s = make(); s.world = new World(); s.playerId = s.world.createEntity();
    s.world.setTransform(s.playerId, { x: 1764, y: 518, rot: 0 });
    s.world.setVelocity(s.playerId, { vx: 200, vy: 0, speed: 220 });
    const previous = { x: 1564, y: 518 };
    s.isBlocked = vi.fn(() => false);
    let sweptDestination: unknown;
    s.townCorner = { blocksMovement: vi.fn((_from, to) => { sweptDestination = { ...to }; return true; }) };
    s.resolveCollisions(new Map([[s.playerId, previous]]));
    expect(sweptDestination).toMatchObject({ x: 1764, y: 518 });
    expect(s.townCorner.blocksMovement).toHaveBeenCalledWith(previous, expect.any(Object), 38);
    expect(s.world.getTransform(s.playerId)).toMatchObject(previous);
    expect(s.world.getVelocity(s.playerId)).toMatchObject({ vx: 0, vy: 0 });
  });

  it.each(['shutdown', 'destroy'])('clears town scenery on scene %s and can clear it again safely', (event) => {
    const s = make(); const callbacks = new EventEmitter(); s.events = callbacks;
    // Stop initialization after its shutdown listener is registered.
    s.cameras = { main: { setBackgroundColor: () => { throw new Error('stop after listener'); } } };
    expect(() => s.initializeScene()).toThrow('stop after listener');
    const corner = { destroy: vi.fn() }; s.townCorner = corner;
    callbacks.emit(event); s.clearTownCorner();
    expect(callbacks.listenerCount('shutdown')).toBe(0);
    expect(callbacks.listenerCount('destroy')).toBe(0);
    expect(corner.destroy).toHaveBeenCalledOnce(); expect(s.townCorner).toBeNull();
  });

  it('rejects a queued sword hit and completion from the previous area', () => {
    const s = make(); s.world = new World(); s.playerId = s.world.createEntity();
    s.world.setTransform(s.playerId, { x: 100, y: 100, rot: 0 });
    const direction = { x: 1, y: 0, lengthSq: () => 1, clone() { return this; }, normalize() { return this; } };
    s.heroFacingVec = direction;
    let hit: (() => void) | undefined; let complete: (() => void) | undefined;
    s.time = { delayedCall: (_delay: number, callback: () => void) => { hit = callback; } };
    s.playerSprite = { play: vi.fn(), once: (_event: string, callback: () => void) => { complete = callback; } };
    s.applyAttackHit = vi.fn();
    s.performAttack(); s.areaEpoch += 1;
    hit!(); complete!();
    expect(s.applyAttackHit).not.toHaveBeenCalled();
    expect(s.heroAttacking).toBe(true); // The stale completion cannot modify the new area's state.
  });
  it('captures collision rollback before a dash teleports the hero', () => {
    const s = make(); const order: string[] = [];
    s.initialized = true; s.runState = 'running'; s.playerId = 1;
    s.world = new World(); s.world.setHealth(1, { current: 140, max: 140 });
    s.handleInput = vi.fn(); s.captureTransforms = () => { order.push('snapshot'); return new Map(); };
    s.handleDash = () => { order.push('dash'); };
    s.resolveCollisions = vi.fn(); s.syncSprites = vi.fn(); s.updateLootCollection = vi.fn();
    s.updateUIState = vi.fn(); s.updateFixedUITransforms = vi.fn();
    s.update(0, 16);
    expect(order).toEqual(['snapshot', 'dash']);
  });

  it('cannot damage the hero when a killed enemy finishes its death animation', () => {
    const s = make(); s.world = new World(); s.runState = 'running';
    s.expedition = enterRuins(createExpedition());
    s.playerId = s.world.createEntity();
    s.world.setTransform(s.playerId, { x: 0, y: 0, rot: 0 });
    s.world.setHealth(s.playerId, { max: 140, current: 140 });
    s.world.setVelocity(s.playerId, { vx: 0, vy: 0, speed: 220 });
    const id = s.world.createEntity();
    s.world.setTransform(id, { x: 50, y: 0, rot: 0 });
    s.world.setHealth(id, { max: 45, current: 45 });
    s.world.setVelocity(id, { vx: 0, vy: 0, speed: 135 });
    const sprite = Object.assign(new EventEmitter(), { play: vi.fn(), destroy: vi.fn() });
    s.skeletons = [{ id, sprite, ring: { destroy: vi.fn() }, alive: true, attackTimer: 0, facing: 'S' }];
    s.updateEnemyBehavior(16); // Attack registers a completion callback.
    s.world.getHealth(id).current = 0;
    s.updateEnemyBehavior(16); // Death begins before attack completes.
    sprite.emit('animationcomplete');
    expect(s.world.getHealth(s.playerId).current).toBe(140);
    expect(s.skeletons).toHaveLength(0);
  });

  it('keeps town untimed and never completes a reward session from town browsing', () => {
    const s = make(); s.initialized = true; s.runState = 'paused'; s.playerId = 1;
    s.updateUIState = vi.fn(); s.endRun = vi.fn();
    s.update(0, 600_000);
    expect(s.elapsed).toBe(0);
    expect(s.endRun).not.toHaveBeenCalled();
    expect(s.handlers.onGameOver).not.toHaveBeenCalled();
  });
  it('starts a bounded clock only when authorized and ignores duplicate start controls', () => {
    const s = make(); s.initialized = true; s.changeArea = vi.fn();
    s.beginExpedition(120_000); s.beginExpedition(120_000);
    expect(s.expeditionActive).toBe(true);
    expect(s.durationLimit).toBe(90_000);
    expect(s.changeArea).toHaveBeenCalledOnce();
    expect(s.changeArea.mock.calls[0][0].area).toBe(1);
  });
  it('freezes one result without pausing the town renderer', () => {
    const s = make(); s.initialized = true; s.expeditionActive = true; s.elapsed = 12345; s.expeditionStartedAt = performance.now() - 12345;
    s.updateUIState = vi.fn(); s.scene = { pause: vi.fn() };
    s.finishExpedition(); s.finishExpedition();
    expect(s.handlers.onGameOver).toHaveBeenCalledOnce();
    expect(s.handlers.onGameOver.mock.calls[0][0]).toBe(0);
    expect(s.handlers.onGameOver.mock.calls[0][1]).toBeGreaterThanOrEqual(12345);
    expect(s.handlers.onGameOver.mock.calls[0][1]).toBeLessThan(12500);
    expect(s.scene.pause).not.toHaveBeenCalled();
    expect(s.townStatus).toBe('saving');
    expect(s.expeditionActive).toBe(false);
  });
  it('does not request another departure while starting, saving or blocked', () => {
    const s = make(); s.handlers.onDepartureRequested = vi.fn(); s.handlers.onRetryRequested = vi.fn();
    for (const status of ['starting', 'saving', 'blocked']) { s.townStatus = status; s.handlePrimaryControl(); }
    expect(s.handlers.onDepartureRequested).not.toHaveBeenCalled();
    s.townStatus = 'retry'; s.handlePrimaryControl();
    expect(s.handlers.onRetryRequested).toHaveBeenCalledOnce();
  });
  it('uses the expedition deadline after a suspended frame, including when paused', () => {
    const s = make(); s.initialized = true; s.playerId = 1; s.expeditionActive = true;
    s.expeditionStartedAt = performance.now() - 120_000; s.runState = 'paused'; s.endRun = vi.fn();
    s.update(0, 16);
    expect(s.elapsed).toBe(90000);
    expect(s.endRun).toHaveBeenCalledOnce();
  });

  it('samples elapsed time at return even without another animation frame', () => {
    const s = make(); s.initialized = true; s.expeditionActive = true; s.elapsed = 16;
    s.expeditionStartedAt = performance.now() - 120_000; s.updateUIState = vi.fn();
    s.finishExpedition();
    expect(s.handlers.onGameOver.mock.calls).toEqual([[0, 90000]]);
  });

  it('does not execute a queued sword hit after the deadline but before the next frame', () => {
    const s = make(); s.playerId = 1; s.runState = 'running';
    s.expedition = enterRuins(createExpedition()); s.expeditionActive = true;
    s.expeditionStartedAt = performance.now() - 120000; s.createSwooshEffect = vi.fn();
    s.applyAttackHit({}, {});
    expect(s.createSwooshEffect).not.toHaveBeenCalled();
  });

  it('resets only run-local progression on a new authorized departure and honors smaller caps', () => {
    const s = make(); s.initialized = true; s.changeArea = vi.fn(); s.world = new World();
    s.playerId = s.world.createEntity(); s.world.tagPlayer(s.playerId, { score: 5600 });
    s.world.setHealth(s.playerId, { current: 180, max: 180 });
    s.expedition = { ...createExpedition(), xp: 250, bankedGold: 8, returned: true, cleared: true };
    s.beginExpedition(30000);
    expect(s.durationLimit).toBe(30000);
    expect(s.world.getPlayer(s.playerId).score).toBe(0);
    expect(s.world.getHealth(s.playerId)).toEqual({ current: 140, max: 140 });
    expect(s.expedition).toEqual(createExpedition());
    expect(s.changeArea.mock.calls[0][0]).toMatchObject({ area: 1, xp: 0, bankedGold: 0 });
  });
  it('rejects invalid control caps without starting the scene clock', () => {
    for (const value of [0, -1, NaN, Infinity, 0.5]) {
      const s = make(); s.initialized = true;
      expect(() => s.beginExpedition(value)).toThrow('Invalid expedition duration');
      expect(s.expeditionActive).toBe(false);
    }
  });

  it('places the control background behind its buttons rather than over them', () => {
    const s = make(); const children: any[] = [];
    const object = (kind: string) => {
      const value: any = { kind };
      for (const method of ['setScrollFactor', 'setDepth', 'setOrigin', 'setInteractive', 'on', 'setAlpha']) {
        value[method] = () => value;
      }
      return value;
    };
    const container = object('container');
    container.add = (objects: any) => {
      for (const item of Array.isArray(objects) ? objects : [objects]) {
        if (!children.includes(item)) children.push(item);
      }
    };
    s.add = { container: () => container, rectangle: () => object('panel'), text: (_x: number, _y: number, label: string) => object(label) };
    s.updateControlButtons = vi.fn();
    s.createControlButtons();
    expect(children.map(value => value.kind)).toEqual(['panel', 'Status: Waiting', 'Enter ruins', 'Finish visit']);
  });

  it('blocks another server start after a real scene entry partially mutates and throws', async () => {
    const s = make(); s.initialized = true;
    s.changeArea = vi.fn(() => { throw new Error('room rebuild failed'); });
    const start = vi.fn(async () => ({ sessionId: 'partial-entry', nonce: 'test-only', serverTime: 0,
      caps: { minDurationMs: 0, maxDurationMs: 90000, maxScorePerMin: 9000, maxScore: 150000, minClientVer: '1.0.0' } }));
    const abandon = vi.fn();
    const town = createTownSession({ start, beginExpedition: limit => s.beginExpedition(limit),
      sign: vi.fn(), complete: vi.fn(), abandon, onState: vi.fn(), onSettled: vi.fn(), now: () => performance.now() });
    await town.depart();
    expect(s.expeditionActive).toBe(true); // Actual mutation happened before the renderer failure.
    expect(town.state).toMatchObject({ phase: 'blocked', issue: { context: 'entry', sessionCreated: true } });
    await town.depart();
    expect(start).toHaveBeenCalledOnce();
    expect(abandon).toHaveBeenCalledWith('partial-entry'); // Local bookkeeping, not a server cancellation.
    town.dispose();
  });

});
