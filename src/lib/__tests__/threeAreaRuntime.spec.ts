import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createThreeWorld } from '$lib/game/renderers/three/threeWorld';
import type { ConnectionStatus, PlayerSnapshot, WorldSnapshot } from '$lib/game/protocol';
import type { WorldSession } from '$lib/game/worldSession';

const state = vi.hoisted(() => ({ sprites: [] as any[], environments: [] as any[], raf: null as (() => void) | null, frames: 0 }));

class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  style = {};
  clientWidth = 960;
  clientHeight = 540;
  hidden = false;
  textContent = '';
  appendChild() {}
  remove() {}
}

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = new ElementStub();
      shadowMap = { enabled: false };
      info = { render: { calls: 0, triangles: 0 } };
      outputColorSpace = 'srgb';
      setPixelRatio() {}
      getPixelRatio() { return 1; }
      setSize() {}
      render() {}
      dispose() {}
      forceContextLoss() { this.domElement.dispatchEvent(new Event('webglcontextlost')); }
      forceContextRestore() { this.domElement.dispatchEvent(new Event('webglcontextrestored')); }
    },
    Clock: class { elapsedTime = 0; getDelta() { this.elapsedTime += 0.016; return 0.016; } }
  };
});

vi.mock('$lib/game/renderers/three/hdSprite', async () => {
  const three = await import('three');
  return {
    PLAYER_ATLAS_URL: '/male.json',
    HdSpriteResources: class { estimatedTextureMemoryBytes = 0; cacheSize = 0; dispose() {} },
    HdSpriteEntity: class {
      root = new three.Group();
      label = new three.Sprite();
      animator = { facing: 's', state: 'idle' };
      animationDiagnostics = null;
      assetDiagnostics = {};
      assetId = '';
      loadState = 'loaded';
      destroyed = false;
      constructor(_resources: unknown, readonly options: any) { this.root.add(this.label); state.sprites.push(this); }
      setOpacity() {}
      update(_delta: number, facing: string, magnitude: number) { this.animator = { facing, state: magnitude > 0 ? 'walk' : 'idle' }; }
      destroy() { this.destroyed = true; }
    }
  };
});

vi.mock('$lib/game/renderers/three/areaEnvironment', async () => {
  const three = await import('three');
  return {
    createAreaEnvironment: (area: { id: string }) => {
      const environment = {
        mapId: area.id, root: new three.Group(), obstructables: [],
        metrics: { instances: 0, visibleProps: 0, animatedInstances: 0, drawCalls: 0, atlasPages: 0, textureMemoryBytes: 0, ambientEffects: 0, animationUpdateMs: 0, failedAssets: 0, decorativeProps: 0, sharedResources: 0 },
        diagnostics: () => ({ objects: [], textures: [], terrain: { assetId: '', textureUrl: '', material: '', color: '', opacity: 1 } }),
        setQuality: vi.fn(), setMoonberryEmphasis: vi.fn(), setPortalEmphasis: vi.fn(), update: vi.fn(), dispose: vi.fn()
      };
      state.environments.push(environment);
      return environment;
    }
  };
});

const player = (values: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  x: 180, y: 270, connected: true, acknowledgedSequence: 0, colorIndex: 0,
  displayName: 'Explorer', handle: '', playerBody: 'male', companionPresent: true,
  companionName: 'Muse', companionKind: 'muse', companionStatus: 'idle', companionRevision: 0, ...values
});

const snapshot = (local: PlayerSnapshot): WorldSnapshot => ({
  localPlayerId: 'local', tick: 1,
  players: new Map([['local', local], ['remote-grove', player({ displayName: 'Grove visitor' })], ['remote-hollow', player({ displayName: 'Hollow visitor', mapId: 'wilds-town' })]]),
  npcs: new Map([
    ['rowan', { id: 'rowan', mapId: 'wilds-exploration', name: 'Rowan', kind: 'resident', playerBody: 'male', x: 300, y: 250, moving: true }],
    ['wren', { id: 'wren', mapId: 'wilds-town', name: 'Wren', kind: 'resident', playerBody: 'female', x: 480, y: 270, moving: true }]
  ])
});

const tick = () => { const frame = state.raf; state.raf = null; frame?.(); };
const key = (code: string, type = 'keydown', repeat = false) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat });
  window.dispatchEvent(event);
};
const activeLabels = () => state.sprites.filter((sprite) => !sprite.destroyed).map((sprite) => sprite.options.label);

const harness = () => {
  let consume: ((snapshot: WorldSnapshot) => void) | null = null;
  let statusConsumer: ((status: ConnectionStatus) => void) | null = null;
  const session = {
    connectionStatus: 'connected' as ConnectionStatus,
    setSnapshotConsumer: vi.fn((consumer) => { consume = consumer; }),
    setStatusConsumer: vi.fn((consumer) => { statusConsumer = consumer; consumer?.(session.connectionStatus); }),
    stopMovement: vi.fn(), sendMovement: vi.fn(), enterPortal: vi.fn(), gatherMoonberry: vi.fn()
  };
  const onPortalPrompt = vi.fn();
  const onAreaChange = vi.fn();
  const onGatherPrompt = vi.fn();
  const runtime = createThreeWorld(new ElementStub() as unknown as HTMLElement, {
    session: session as unknown as WorldSession, onPortalPrompt, onAreaChange, onGatherPrompt
  });
  return {
    runtime, session, onPortalPrompt, onAreaChange, onGatherPrompt,
    apply: (value: WorldSnapshot) => consume!(value),
    status: (value: ConnectionStatus) => { session.connectionStatus = value; statusConsumer?.(value); }
  };
};

beforeEach(() => {
  state.sprites = [];
  state.environments = [];
  state.raf = null;
  state.frames = 0;
  const windowStub = new EventTarget();
  Object.assign(windowStub, { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', { createElement: () => new ElementStub() });
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { state.raf = callback; return ++state.frames; });
  vi.stubGlobal('cancelAnimationFrame', () => { state.raf = null; });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Three area runtime lifecycle', () => {
  it('replaces environments and entities on repeated travel and resets companion interpolation', () => {
    const h = harness();
    h.apply(snapshot(player()));
    expect(activeLabels()).toContain('Rowan · Resident');
    expect(activeLabels()).not.toContain('Wren · Resident');
    expect(activeLabels()).not.toContain('Hollow visitor');
    const firstSprites = [...state.sprites];
    h.apply(snapshot(player({ mapId: 'wilds-town', transitionRevision: 1, x: 160, y: 270 })));
    expect(firstSprites.every((sprite) => sprite.destroyed)).toBe(true);
    expect(activeLabels()).toContain('Wren · Resident');
    expect(activeLabels()).toContain('Hollow visitor');
    expect(activeLabels()).not.toContain('Rowan · Resident');
    expect(activeLabels()).not.toContain('Grove visitor');
    expect(state.environments[0].dispose).toHaveBeenCalledOnce();
    expect(h.onAreaChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'wilds-town' }));
    const local = state.sprites.findLast((sprite) => sprite.options.label === 'Explorer');
    expect(local.root.position.x).toBe(-10);
    const companion = state.sprites.find((sprite) => !sprite.destroyed && sprite.options.label === 'Muse');
    expect(companion.root.position.x).toBeCloseTo(-10.9);
    h.apply(snapshot(player({ transitionRevision: 2, x: 804, y: 270 })));
    expect(activeLabels()).toContain('Rowan · Resident');
    expect(activeLabels()).not.toContain('Wren · Resident');
    expect(state.environments[1].dispose).toHaveBeenCalledOnce();
    h.runtime.destroy();
    h.runtime.destroy();
    expect(state.sprites.every((sprite) => sprite.destroyed)).toBe(true);
    expect(state.environments[2].dispose).toHaveBeenCalledOnce();
    expect(h.session.setSnapshotConsumer).toHaveBeenLastCalledWith(null);
    expect(h.session.setStatusConsumer).toHaveBeenLastCalledWith(null);
  });

  it('freezes prediction on disconnect and requires fresh input after reconnect and pause', () => {
    const h = harness();
    h.apply(snapshot(player()));
    const local = state.sprites.find((sprite) => sprite.options.label === 'Explorer');
    key('KeyD');
    tick();
    expect(h.session.sendMovement).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    h.status('reconnecting');
    const disconnectedX = local.root.position.x;
    tick(); tick();
    expect(local.root.position.x).toBe(disconnectedX);
    h.status('connected');
    h.session.sendMovement.mockClear();
    key('KeyD', 'keydown', true);
    tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    key('KeyD', 'keyup'); key('KeyD'); tick();
    expect(h.session.sendMovement).toHaveBeenCalled();
    h.runtime.pause();
    expect(h.session.stopMovement).toHaveBeenCalled();
    h.session.sendMovement.mockClear();
    h.runtime.resume(); key('KeyD', 'keydown', true); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    h.runtime.destroy();
  });

  it.each(['disconnected', 'paused'] as const)('suppresses a key first pressed while %s until an actual keyup', (inactive) => {
    const h = harness();
    h.apply(snapshot(player()));
    if (inactive === 'disconnected') h.status('reconnecting');
    else h.runtime.pause();
    key('KeyD');
    tick();
    if (inactive === 'disconnected') h.status('connected');
    else h.runtime.resume();
    h.session.sendMovement.mockClear();
    key('KeyD', 'keydown', true); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    // Losing focus can reset the browser's repeat flag without a real key release.
    key('KeyD', 'keydown', false); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    key('KeyD', 'keyup'); key('KeyD'); tick();
    expect(h.session.sendMovement).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    h.runtime.destroy();
  });

  it('suppresses a movement key held through travel even if subsequent events lose their repeat flag', () => {
    const h = harness();
    h.apply(snapshot(player()));
    key('KeyD'); tick();
    expect(h.session.sendMovement).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    h.apply(snapshot(player({ mapId: 'wilds-town', transitionRevision: 1, x: 160, y: 270 })));
    h.session.sendMovement.mockClear();
    key('KeyD', 'keydown', true); tick();
    key('KeyD', 'keydown', false); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    key('KeyD', 'keyup'); key('KeyD'); tick();
    expect(h.session.sendMovement).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    h.runtime.destroy();
  });

  it('prioritizes in-range portal interaction over gathering and rejects stale prompts', () => {
    const h = harness();
    h.apply(snapshot(player({ x: 880, y: 270 })));
    expect(h.onPortalPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'grove-to-hollow' }));
    key('KeyE');
    expect(h.session.enterPortal).toHaveBeenCalledWith('grove-to-hollow');
    expect(h.session.gatherMoonberry).not.toHaveBeenCalled();
    h.apply(snapshot(player({ mapId: 'wilds-town', transitionRevision: 1, x: 160, y: 270 })));
    h.session.enterPortal.mockClear();
    h.runtime.enterPortal();
    expect(h.session.enterPortal).not.toHaveBeenCalled();
    h.apply(snapshot(player({ mapId: 'wilds-town', transitionRevision: 1, x: 80, y: 270 })));
    h.runtime.enterPortal();
    expect(h.session.enterPortal).toHaveBeenCalledWith('hollow-to-grove');
    h.status('reconnecting');
    expect(h.onPortalPrompt).toHaveBeenLastCalledWith(null);
    h.session.enterPortal.mockClear();
    h.runtime.enterPortal();
    expect(h.session.enterPortal).not.toHaveBeenCalled();
    h.runtime.destroy();
    h.session.enterPortal.mockClear();
    h.runtime.enterPortal();
    expect(h.session.enterPortal).not.toHaveBeenCalled();
  });

  it('snaps reduced-motion interpolation and removes pending input on blur/context loss', () => {
    Object.assign(window, { matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    const h = harness();
    h.apply(snapshot(player()));
    const local = state.sprites.find((sprite) => sprite.options.label === 'Explorer');
    h.apply(snapshot(player({ x: 220 })));
    tick();
    expect(local.root.position.x).toBe((220 - 480) / 32);
    expect(state.environments[0].update).toHaveBeenLastCalledWith(0, expect.any(THREE.Vector3), expect.any(THREE.Quaternion), expect.any(THREE.Vector3), expect.any(THREE.Vector3));
    key('KeyD'); tick();
    window.dispatchEvent(new Event('blur'));
    h.session.sendMovement.mockClear();
    key('KeyD', 'keydown', true); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    key('KeyD', 'keyup'); key('KeyD'); tick();
    h.runtime.simulateContextLoss();
    h.session.sendMovement.mockClear();
    tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    h.runtime.simulateContextRestore();
    key('KeyD', 'keydown', true); tick();
    expect(h.session.sendMovement).not.toHaveBeenCalled();
    h.runtime.destroy();
  });
});
