import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Exercise the real preload/create boundary with renderer effects stubbed.
// This is not Phaser/browser rendering or image decoding evidence.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
    Loader: { Events: { FILE_LOAD_ERROR: 'loaderror' } },
    Scenes: { Events: { CREATE: 'create' } }
  }
}));
import { GameScene } from '$lib/games/arpg/scenes/GameScene';

let scene: GameScene;
let events: EventEmitter;
let loader: EventEmitter & { image: Mock<[string, string], void> };
let queued: Map<string, string>;
let textures: Set<string>;
let handlers: { isCurrent: Mock<[], boolean>; onReady: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn>; onGameOver: ReturnType<typeof vi.fn> };
let initialize: ReturnType<typeof vi.fn>;
const finishAssets = () => { for (const key of queued.keys()) textures.add(key); };
const create = () => { scene.create(); events.emit('create', scene); };

beforeEach(() => {
  events = new EventEmitter(); queued = new Map(); textures = new Set();
  loader = Object.assign(new EventEmitter(), { image: vi.fn((key: string, path: string) => { queued.set(key, path); }) });
  handlers = { isCurrent: vi.fn(() => true), onReady: vi.fn(), onError: vi.fn(), onGameOver: vi.fn() };
  scene = new GameScene(handlers);
  initialize = vi.fn();
  Object.assign(scene, {
    load: loader, events,
    textures: { exists: (key: string) => textures.has(key) },
    initializeScene: initialize
  });
});

describe('real ARPG scene initialization contract with fake Phaser effects', () => {
  it('keeps readiness pending through preload and successful initialization until CREATE', () => {
    scene.preload();
    expect(queued.size).toBeGreaterThan(100);
    finishAssets();
    expect(handlers.onReady).not.toHaveBeenCalled();
    scene.create();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(handlers.onReady).not.toHaveBeenCalled();
    events.emit('create', scene);
    expect(handlers.onReady).toHaveBeenCalledTimes(1);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(loader.listenerCount('loaderror')).toBe(0);
  });

  it('checks the final queued VFX texture before allowing initialization', () => {
    scene.preload(); finishAssets();
    textures.delete('vfx_zone'); create();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it.each(['town_corner_cobble_source_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1'])('requires the town source texture %s before initialization', (key) => {
    scene.preload(); finishAssets();
    expect(queued.get(key)).toMatch(/^\/games\/arpg\/town-corner-v1\/.*\.png$/);
    expect(queued.size).toBe(252);
    textures.delete(key); create();
    expect(handlers.onError).toHaveBeenCalledOnce();
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('rejects a download failure once and never initializes or resolves after loader completion', () => {
    scene.preload();
    loader.emit('loaderror', { key: queued.keys().next().value });
    loader.emit('loaderror', { key: 'another_failure' });
    finishAssets(); create();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError.mock.calls[0]![0].message).toContain('assets could not be loaded');
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('rejects a decode-style missing texture even without any loaderror event', () => {
    scene.preload(); finishAssets();
    textures.delete('floor_0'); create();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('checks missing character-manifest frames as well as floor textures', () => {
    scene.preload(); finishAssets();
    const key = [...queued.keys()].find((value) => value.includes('knight'))!;
    expect(key).toBeTruthy(); textures.delete(key); create();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
  });

  it('rejects preload queue exceptions without a later false-ready signal', () => {
    loader.image.mockImplementationOnce(() => { throw new Error('queue failed'); });
    scene.preload(); finishAssets(); create();
    expect(handlers.onError.mock.calls[0]![0].message).toBe('queue failed');
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
  });

  it('rejects an exception during scene initialization and suppresses subsequent CREATE', () => {
    initialize.mockImplementationOnce(() => { throw new Error('input setup failed'); });
    scene.preload(); finishAssets(); create();
    expect(handlers.onError.mock.calls[0]![0].message).toBe('input setup failed');
    expect(handlers.onReady).not.toHaveBeenCalled();
    scene.update(0, 100_000);
    expect(handlers.onGameOver).not.toHaveBeenCalled();
  });

  it('does not queue assets for a scene whose owner is already obsolete', () => {
    handlers.isCurrent.mockReturnValue(false);
    scene.preload(); create();
    expect(loader.image).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('ignores obsolete loader completion and failure before deferred engine destruction', () => {
    scene.preload(); handlers.isCurrent.mockReturnValue(false);
    finishAssets(); loader.emit('loaderror'); create();
    expect(initialize).not.toHaveBeenCalled();
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('ignores CREATE if ownership changes during initialization', () => {
    initialize.mockImplementationOnce(() => handlers.isCurrent.mockReturnValue(false));
    scene.preload(); finishAssets(); create();
    expect(handlers.onReady).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('does not advance the game before CREATE or after ownership is invalidated', () => {
    const world = { getPlayer: vi.fn(), getHealth: vi.fn() };
    Object.assign(scene, { playerId: 1, world });
    scene.update(0, 100_000);
    expect(world.getPlayer).not.toHaveBeenCalled();
    scene.preload(); finishAssets(); create();
    handlers.isCurrent.mockReturnValue(false);
    scene.update(0, 100_000);
    expect(world.getPlayer).not.toHaveBeenCalled();
    expect(handlers.onGameOver).not.toHaveBeenCalled();
  });

  it('does not redirect an older scene completion into a later scene handler', () => {
    scene.preload(); finishAssets(); create();
    const other = { ...handlers, onGameOver: vi.fn() };
    new GameScene(other);
    Object.assign(scene, {
      playerId: 1,
      world: { getPlayer: () => ({ score: 42 }) },
      updateUIState: vi.fn(),
      expeditionActive: true,
      elapsed: 90000
    });
    (scene as any).finishExpedition();
    expect(handlers.onGameOver.mock.calls).toEqual([[42, 90000]]);
    expect(other.onGameOver).not.toHaveBeenCalled();
  });
});
