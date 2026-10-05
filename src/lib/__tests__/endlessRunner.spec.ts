import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNNER_LANTERNWAY_ATLAS } from '$lib/games/runnerLanternwayAtlas';
import type { RunnerLanternwayAssets } from '$lib/games/runnerLanternwaySkin';
import { createEndlessRunner, RUNNER_WIDTH, RUNNER_HEIGHT, type EndlessRunnerInstance, type EndlessRunnerOptions } from '$lib/games/endlessRunner';

vi.mock('$lib/games/audio', () => ({ playSound: vi.fn() }));

describe('Neon Run real engine', () => {
  let now: number;
  let frames: Map<number, FrameRequestCallback>;
  let listeners: Map<string, EventListener>;
  let canvas: HTMLCanvasElement;
  let game: EndlessRunnerInstance;
  let end: ReturnType<typeof vi.fn>;
  let stateChange: ReturnType<typeof vi.fn>;
  let obstaclePositions: number[];
  let pickupPositions: number[];
  let cssWidth: number;
  let imageDraw: ReturnType<typeof vi.fn>;
  const step = (ms = 16) => {
    now += ms;
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(now);
  };
  const emit = (name: string, fields: Record<string, unknown> = {}) => {
    const event = { preventDefault: vi.fn(), ...fields };
    listeners.get(name)?.(event as unknown as Event);
    return event;
  };
  const create = (options: Partial<EndlessRunnerOptions> = {}) => {
    end = vi.fn(); stateChange = vi.fn();
    game = createEndlessRunner({ canvas, onGameOver: end, onStateChange: stateChange, ...options });
    return game;
  };
  const seedRandom = (seed: number) => {
    let x = seed >>> 0;
    vi.spyOn(Math, 'random').mockImplementation(() => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; });
  };
  beforeEach(() => {
    now = 0; cssWidth = 960; frames = new Map(); listeners = new Map(); obstaclePositions = []; pickupPositions = [];
    let frame = 0;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    seedRandom(4);
    let path: number[] = [];
    imageDraw = vi.fn();
    const context = {
      fillStyle: '', clearRect: () => { obstaclePositions = []; pickupPositions = []; },
      beginPath: () => { path = []; }, moveTo: (x: number) => path.push(x), lineTo: (x: number) => path.push(x),
      fill() { if (this.fillStyle === '#f97316' && path.length === 3) obstaclePositions.push(Math.min(...path)); },
      translate: (x: number) => { if (x !== RUNNER_WIDTH * .2) pickupPositions.push(x); },
      createLinearGradient: () => ({ addColorStop: vi.fn() }), createRadialGradient: () => ({ addColorStop: vi.fn() }),
      save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), drawImage: imageDraw, closePath: vi.fn(), quadraticCurveTo: vi.fn(),
      arc: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), rotate: vi.fn(), fillText: vi.fn()
    };
    canvas = { width: 0, height: 0, style: {}, getContext: () => context,
      getBoundingClientRect: () => ({ width: cssWidth, height: cssWidth * 9 / 16, left: 0, top: 0 }),
      focus: vi.fn(),
      addEventListener: (name: string, cb: EventListener) => listeners.set(name, cb),
      removeEventListener: (name: string) => listeners.delete(name)
    } as unknown as HTMLCanvasElement;
  });
  afterEach(() => { game?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('has one loop only after an explicit start and reports initial shield state', () => {
    create(); expect(frames.size).toBe(0); expect(end).not.toHaveBeenCalled();
    game.start(); game.start(); expect(frames.size).toBe(1);
    expect(game.getState()).toMatchObject({ score: 0, elapsedMs: 0, playerX: 192, playerY: 405, powerups: { shield: true } });
    expect(stateChange).toHaveBeenCalledOnce();
  });
  it('makes narrow and wide viewport runs identical and does not move the world on CSS resize', () => {
    const run = (width: number, resize: boolean) => {
      seedRandom(99); cssWidth = width; create().start();
      for (let i = 0; i < 800 && !end.mock.calls.length; i++) { if (resize && i === 80) cssWidth = 320; step(); }
      const snapshot = { state: game.getState(), result: end.mock.calls[0]?.[0] };
      expect(canvas.width).toBe(960); expect(canvas.height).toBe(540); game.destroy(); return snapshot;
    };
    expect(run(320, false)).toEqual(run(1280, true));
  });
  it('keeps fully drawn Lanternway, fallback and reduced-motion runs identical in simulation', () => {
    const assets = Object.fromEntries(Object.entries(RUNNER_LANTERNWAY_ATLAS).map(([name, info]) =>
      [name, { naturalWidth: info.width, naturalHeight: info.height }])) as RunnerLanternwayAssets;
    const run = (skinAssets?: RunnerLanternwayAssets, reducedMotion = false) => {
      seedRandom(123); imageDraw.mockClear();
      create({ ...(skinAssets ? { skinAssets } : {}), reducedMotion: () => reducedMotion }).start();
      for (let i = 0; i < 1200 && !end.mock.calls.length; i++) {
        if (i % 90 === 0) game.playerJump();
        step();
      }
      const snapshot = { state: game.getState(), result: end.mock.calls[0]?.[0] };
      if (skinAssets) expect(imageDraw.mock.calls.some(args => args[0] === skinAssets.adventurer)).toBe(true);
      else expect(imageDraw).not.toHaveBeenCalled();
      game.destroy(); return snapshot;
    };
    const fallback = run(); expect(run(assets)).toEqual(fallback); expect(run(assets, true)).toEqual(fallback);
  });
  it('reports the actual early collision once without padding its duration to ten seconds', () => {
    create().start();
    for (let i = 0; i < 800 && !end.mock.calls.length; i++) step();
    expect(end).toHaveBeenCalledOnce();
    const result = end.mock.calls[0]![0];
    expect(result.durationMs).toBeGreaterThan(0); expect(result.durationMs).toBeLessThan(10_000);
    expect(result.meta.survived_round).toBe(0);
    expect(result.score).toBe(game.getState().score); expect(result.meta.distance_meters).toBe(game.getState().distanceMeters);
    expect(stateChange.mock.calls.at(-1)?.[0]).toEqual(game.getState());
    expect(frames.size).toBe(0); expect(listeners.size).toBe(0);
    game.start(); step(); expect(end).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
  });
  it('freezes both time and inputs while paused, with no catch-up or duplicate resume loops', () => {
    create().start(); step(); game.pause(); const paused = game.getState();
    game.playerJump(); emit('keydown', { code: 'Space' }); emit('pointerdown', { pointerType: 'touch', isPrimary: true });
    step(30_000); expect(game.getState()).toEqual(paused); expect(frames.size).toBe(0);
    game.resume(); game.resume(); expect(frames.size).toBe(1); step();
    expect(game.getState().elapsedMs).toBe(32); expect(game.getState().onGround).toBe(true);
  });
  it('accepts focused keyboard jumps but ignores repeats/modifiers and cannot double-jump', () => {
    create().start();
    emit('keydown', { code: 'Space', repeat: true }); step(); expect(game.getState().onGround).toBe(true);
    emit('keydown', { code: 'ArrowUp', ctrlKey: true }); step(); expect(game.getState().onGround).toBe(true);
    const key = emit('keydown', { code: 'ArrowUp', repeat: false }); step();
    expect(key.preventDefault).toHaveBeenCalledOnce(); expect(game.getState().playerY).toBeLessThan(405);
    game.playerJump(); step(); expect(game.getState().playerY).toBeCloseTo(378.8752);
  });
  it('uses a single primary pointerdown path without click/touchstart duplicates or right-click jumps', () => {
    create().start(); expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    emit('pointerdown', { pointerType: 'mouse', button: 2 }); step(); expect(game.getState().onGround).toBe(true);
    emit('pointerdown', { pointerType: 'touch', isPrimary: false }); step(); expect(game.getState().onGround).toBe(true);
    const touch = emit('pointerdown', { pointerType: 'touch', isPrimary: true }); step();
    expect(touch.preventDefault).toHaveBeenCalledOnce(); expect(canvas.focus).toHaveBeenCalledOnce();
    expect(game.getState().onGround).toBe(false);
  });
  it('bounds a stalled frame and never inflates score, duration or distance with hidden time', () => {
    create().start(); step(60_000);
    expect(game.getState()).toMatchObject({ elapsedMs: 50, simulationElapsedMs: 50, score: 0, distanceMeters: 10 });
  });
  it('finishes at the server cap exactly, removing input and frames', () => {
    create({ maxDurationMs: 101 }).start(); step(50); step(50); step(50);
    expect(end).toHaveBeenCalledOnce(); expect(end.mock.calls[0]![0]).toMatchObject({ score: 1, durationMs: 101, meta: { survived_round: 1 } });
    expect(frames.size).toBe(0); expect(listeners.size).toBe(0);
  });
  it('reset stops a live or paused run and gives the next explicit start a clean state', () => {
    create().start(); game.playerJump(); step(50); game.pause(); game.reset();
    expect(game.getState()).toMatchObject({ score: 0, elapsedMs: 0, simulationElapsedMs: 0, distanceMeters: 0,
      shardsCollected: 0, playerX: 192, playerY: 405, onGround: true,
      powerups: { shield: true, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 } });
    expect(frames.size).toBe(0); expect(listeners.size).toBe(0); expect(end).not.toHaveBeenCalled();
    game.start(); step(); expect(game.getState().elapsedMs).toBe(16); expect(frames.size).toBe(1);
  });
  it('destroy is terminal and cannot restart, reset, jump, or emit a later completion', () => {
    create().start(); step(); const state = game.getState(); game.destroy(); game.destroy();
    game.start(); game.reset(); game.resume(); game.playerJump(); step(50000);
    expect(game.getState()).toEqual(state); expect(end).not.toHaveBeenCalled(); expect(frames.size).toBe(0); expect(listeners.size).toBe(0);
  });
  it('preserves all six natural power-ups and authoritative score/state through seeded played runs', () => {
    const observed = new Set<string>();
    let slowSample = false; let surgeSample = false; let shardSample = false;
    // Driver uses drawn obstacle/pickup positions, then the same public jump action as a player.
    // No direct activation, internal state mutation, clock padding, or reward endpoint.
    for (let seed = 1; seed <= 80 && (observed.size < 6 || !slowSample || !surgeSample || !shardSample); seed++) {
      seedRandom(seed); create({ maxDurationMs: 45_000 }).start();
      let previous = game.getState();
      let expectedScore = 0;
      for (let i = 0; i < 2900 && !end.mock.calls.length; i++) {
        const x = game.getState().playerX;
        if (game.getState().onGround && (obstaclePositions.some(pos => pos > x - 10 && pos < x + 115) || pickupPositions.some(pos => pos > x - 5 && pos < x + 15))) game.playerJump();
        step();
        const current = game.getState();
        const activeStep = current.elapsedMs - previous.elapsedMs;
        expectedScore += activeStep * (previous.powerups.slowMo > 0 ? .4 : 1) * .012 * (previous.powerups.dreamSurge > 0 ? 1.5 : 1);
        expect(current.score).toBe(Math.floor(expectedScore));
        for (const name of ['magnet', 'doubleShards', 'slowMo', 'dash', 'dreamSurge'] as const) if (current.powerups[name] > 0) observed.add(name);
        if (!previous.powerups.shield && current.powerups.shield) observed.add('shield');
        if (previous.powerups.slowMo > 0 && current.elapsedMs > previous.elapsedMs) {
          slowSample = true;
          expect(current.simulationElapsedMs - previous.simulationElapsedMs).toBeLessThan(current.elapsedMs - previous.elapsedMs);
        }
        if (previous.powerups.dreamSurge > 0) { surgeSample = true; expect(current.score).toBeGreaterThanOrEqual(previous.score); }
        if (current.shardsCollected > 0) shardSample = true;
        expect(stateChange.mock.calls.at(-1)?.[0]).toEqual(current);
        previous = current;
      }
      if (end.mock.calls.length) {
        expect(end.mock.calls[0]![0].score).toBe(game.getState().score);
        if (end.mock.calls[0]![0].meta.shield_powerups > 0) observed.add('shield');
      }
      game.destroy();
    }
    expect([...observed].sort()).toEqual(['dash', 'doubleShards', 'dreamSurge', 'magnet', 'shield', 'slowMo']);
    expect({ slowSample, surgeSample, shardSample }).toEqual({ slowSample: true, surgeSample: true, shardSample: true });
  });
});
