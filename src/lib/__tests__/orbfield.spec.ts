import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDodgeSurvive } from '$lib/games/dodgeSurvive';
import type { OrbfieldSkinAssets } from '$lib/games/orbfieldSkin';

describe('Orbfield real engine', () => {
  let now: number;
  let frames: Map<number, FrameRequestCallback>;
  let listeners: Map<string, EventListener>;
  let canvas: HTMLCanvasElement;
  let game: ReturnType<typeof createDodgeSurvive>;
  let end: ReturnType<typeof vi.fn>;
  const step = (ms = 16) => {
    now += ms;
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback(now);
  };
  const emit = (type: string, values: Record<string, unknown> = {}) => {
    listeners.get(type)?.({ type, preventDefault: vi.fn(), ...values } as unknown as Event);
  };
  const create = (maxDurationMs = 60_000, skinAssets?: OrbfieldSkinAssets) => {
    end = vi.fn();
    game = createDodgeSurvive({ canvas, onGameOver: end, maxDurationMs, ...(skinAssets ? { skinAssets } : {}) });
    return game;
  };

  beforeEach(() => {
    now = 0; frames = new Map(); listeners = new Map();
    let frameId = 0;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++frameId; frames.set(id, callback); return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() }),
      beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), save: vi.fn(), restore: vi.fn(),
      drawImage: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn() };
    canvas = {
      width: 960, height: 540, getContext: () => context,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 480, height: 270 }),
      addEventListener: (type: string, callback: EventListener) => listeners.set(type, callback),
      removeEventListener: (type: string) => listeners.delete(type),
      focus: vi.fn(), setPointerCapture: vi.fn()
    } as unknown as HTMLCanvasElement;
  });
  afterEach(() => { game?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps loaded and fallback art identical in simulation and collision outcomes', () => {
    const run = (skinAssets?: OrbfieldSkinAssets) => {
      create(10_000, skinAssets).start();
      emit('keydown', { code: 'ArrowRight' }); step(50); emit('keyup', { code: 'ArrowRight' });
      game.activateSlowMo();
      for (let i = 0; i < 240 && !end.mock.calls.length; i++) step(50);
      const result = { state: game.getState(), results: end.mock.calls };
      game.destroy(); return result;
    };
    const fallback = run();
    const image = { naturalWidth: 128, naturalHeight: 128 } as HTMLImageElement;
    expect(run({ background: image, player: image, hazard: image, companion: image })).toEqual(fallback);
  });

  it('starts only once and does not award a result just by mounting', () => {
    create(); expect(end).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
    game.start(); game.start(); expect(frames.size).toBe(1);
  });
  it('maps a scaled and offset pointer to logical canvas coordinates', () => {
    create().start(); emit('pointermove', { pointerType: 'mouse', clientX: 250, clientY: 155 });
    expect(game.getState()).toMatchObject({ playerX: 480, playerY: 270 });
  });
  it('clamps pointer motion to the play area including captured drags outside it', () => {
    create().start(); emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: -90, clientY: 900 });
    expect(game.getState()).toMatchObject({ playerX: 12, playerY: 528 });
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(2);
  });
  it('accepts one active touch and releases it on cancellation', () => {
    create().start();
    emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 400, clientY: 200 });
    expect(game.getState().playerX).toBe(480);
    emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 100 });
    expect(game.getState().playerX).toBe(180);
    emit('pointercancel', { pointerId: 2 });
    emit('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 400, clientY: 200 });
    expect(game.getState().playerX).toBe(180);
  });
  it('keeps the first touch in control when another finger touches or lifts', () => {
    create().start();
    emit('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 });
    emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 400, clientY: 200 });
    expect(game.getState().playerX).toBe(180);
    emit('pointerup', { pointerId: 2 });
    emit('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 150, clientY: 100 });
    expect(game.getState().playerX).toBe(280);
    emit('lostpointercapture', { pointerId: 1 });
    emit('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 100 });
    expect(game.getState().playerX).toBe(280);
  });
  it('supports arrow and WASD movement and key release', () => {
    create().start(); emit('keydown', { code: 'ArrowRight' }); step();
    expect(game.getState().playerX).toBeGreaterThan(480);
    emit('keyup', { code: 'ArrowRight' }); const x = game.getState().playerX; step();
    expect(game.getState().playerX).toBe(x);
    emit('keydown', { code: 'KeyW' }); step(); expect(game.getState().playerY).toBeLessThan(270);
  });
  it('normalizes diagonal keyboard speed', () => {
    create().start(); emit('keydown', { code: 'ArrowRight' }); emit('keydown', { code: 'ArrowDown' }); step();
    const s = game.getState(); expect(Math.hypot(s.playerX - 480, s.playerY - 270)).toBeCloseTo(0.32 * 16);
  });
  it('clears held movement on blur', () => {
    create().start(); emit('keydown', { code: 'ArrowRight' }); emit('blur'); step();
    expect(game.getState().playerX).toBe(480);
  });
  it('has a bounded three-charge touch/keyboard warp with no repeat consumption', () => {
    create().start(); game.activateSlowMo(); game.activateSlowMo();
    expect(game.getState()).toMatchObject({ slowCharges: 2, slowMoActive: true });
    for (let i = 0; i < 40; i++) step(50);
    emit('keydown', { code: 'Space', repeat: true }); expect(game.getState().slowCharges).toBe(2);
    emit('keydown', { code: 'Space', repeat: false }); expect(game.getState().slowCharges).toBe(1);
  });
  it('cannot spend warp before start or while paused', () => {
    create(); game.activateSlowMo(); expect(game.getState().slowCharges).toBe(3);
    game.start(); game.pause(); game.activateSlowMo(); expect(game.getState().slowCharges).toBe(3);
  });
  it('pauses time and input, resumes without catching up hidden time', () => {
    create().start(); step(); const state = game.getState(); game.pause();
    expect(frames.size).toBe(0);
    emit('pointermove', { pointerType: 'mouse', clientX: 20, clientY: 20 });
    step(30_000); expect(game.getState()).toEqual(state);
    game.resume(); game.resume(); expect(frames.size).toBe(1); step();
    expect(game.getState().elapsedMs).toBe(32);
  });
  it('bounds long frames instead of teleporting enemies or inflating elapsed time', () => {
    create().start(); step(60_000); expect(game.getState().elapsedMs).toBe(50);
  });
  it('finishes a bounded round exactly once and stops animation', () => {
    create(100).start(); step(50); step(50); game.start(); step();
    expect(end).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledWith({ score: 1, durationMs: 100, meta: { time_warps_used: 0, survived_round: 1 } });
    expect(frames.size).toBe(0);
  });
  it('reports a collision once with real elapsed time and no victory claim', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    create().start();
    for (let i = 0; i < 400 && !end.mock.calls.length; i++) step(50);
    expect(end).toHaveBeenCalledOnce();
    expect(end.mock.calls[0]![0].meta.survived_round).toBe(0);
    expect(end.mock.calls[0]![0].durationMs).toBeGreaterThan(0);
    expect(frames.size).toBe(0);
  });
  it('destroy removes input and animation and prevents future starts or completions', () => {
    create().start(); game.destroy(); game.destroy(); game.start(); step();
    expect(listeners.size).toBe(0); expect(frames.size).toBe(0); expect(end).not.toHaveBeenCalled();
  });
});
