import { describe, expect, it, vi } from 'vitest';
import { activateWorldRuntime, releaseWorldRuntime } from '$lib/game/worldRuntimeRegistry';

const runtime = () => ({ resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() });

describe('world runtime registry', () => {
  it('allows one renderer runtime and destroys the prior renderer once', () => {
    const phaser = runtime();
    const three = runtime();
    activateWorldRuntime(phaser);
    activateWorldRuntime(three);
    expect(phaser.destroy).toHaveBeenCalledOnce();
    expect(three.destroy).not.toHaveBeenCalled();
    releaseWorldRuntime(three);
  });
});
