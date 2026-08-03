import { describe, expect, it, vi } from 'vitest';
import { fitWorldViewport, normalizeMovement } from '$lib/game/config';
import { isWorldEnabled } from '$lib/game/featureFlag';
import { GameLifecycle, type GameRuntime } from '$lib/game/lifecycle';

const host = {} as HTMLElement;

describe('world feature flag', () => {
  it('fails closed unless explicitly enabled', () => {
    expect(isWorldEnabled(undefined)).toBe(false);
    expect(isWorldEnabled('false')).toBe(false);
    expect(isWorldEnabled('true')).toBe(true);
    expect(isWorldEnabled(' 1 ')).toBe(true);
  });
});

describe('world configuration', () => {
  it('fits the logical world without changing its aspect ratio', () => {
    expect(fitWorldViewport(1200, 500)).toEqual({ width: 888, height: 500 });
    expect(fitWorldViewport(480, 800)).toEqual({ width: 480, height: 270 });
  });

  it('normalizes diagonal input and rejects invalid values', () => {
    const diagonal = normalizeMovement(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(normalizeMovement(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });
});

describe('game lifecycle', () => {
  it('forwards lifecycle calls and destroys exactly once', async () => {
    const runtime: GameRuntime = {
      resize: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      destroy: vi.fn()
    };
    const lifecycle = new GameLifecycle(() => runtime);

    await lifecycle.mount(host);
    lifecycle.resize(960, 540);
    lifecycle.pause();
    lifecycle.resume();
    lifecycle.destroy();
    lifecycle.destroy();

    expect(runtime.resize).toHaveBeenCalledWith(960, 540);
    expect(runtime.pause).toHaveBeenCalledOnce();
    expect(runtime.resume).toHaveBeenCalledOnce();
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it('destroys a stale async runtime after a newer mount', async () => {
    let resolveFirst!: (runtime: GameRuntime) => void;
    const first = new Promise<GameRuntime>((resolve) => (resolveFirst = resolve));
    const stale = { resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() };
    const current = { resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(current);
    const lifecycle = new GameLifecycle(factory);

    const firstMount = lifecycle.mount(host);
    await lifecycle.mount(host);
    resolveFirst(stale);
    await firstMount;

    expect(stale.destroy).toHaveBeenCalledOnce();
    expect(current.destroy).not.toHaveBeenCalled();
  });
});
