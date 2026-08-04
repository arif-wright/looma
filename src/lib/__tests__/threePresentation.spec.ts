import { describe, expect, it } from 'vitest';
import { CompanionTrail } from '$lib/game/renderers/three/companionTrail';
import { ObstructionFadeController } from '$lib/game/renderers/three/obstruction';
import { parseSyntheticDensity, qualityDprCap, selectVisualQuality } from '$lib/game/renderers/three/performance';

describe('Three renderer presentation mechanics', () => {
  it('fades only obstructing props and restores them smoothly', () => {
    const fader = new ObstructionFadeController();
    const faded = fader.update(['tree', 'rock'], new Set(['tree']), 1);
    expect(faded.find((item) => item.id === 'tree')!.opacity).toBeLessThan(0.3);
    expect(faded.find((item) => item.id === 'rock')!.opacity).toBe(1);
    const restored = fader.update(['tree', 'rock'], new Set(), 1);
    expect(restored.find((item) => item.id === 'tree')!.opacity).toBeGreaterThan(0.99);
  });

  it('selects a stable trailing companion point independent of camera state', () => {
    const trail = new CompanionTrail(1);
    for (let x = 0; x <= 3; x += 0.25) trail.push({ x, z: 0 });
    const target = trail.target({ x: 3, z: 0 });
    expect(target.x).toBeLessThanOrEqual(2);
    expect(target.z).toBe(0);
  });

  it('accepts only supported synthetic densities and degrades conservatively', () => {
    expect(parseSyntheticDensity('5')).toBe(5);
    expect(parseSyntheticDensity('32')).toBe(32);
    expect(parseSyntheticDensity('1000')).toBe(0);
    expect(selectVisualQuality(50)).toBe('full');
    expect(selectVisualQuality(35)).toBe('reduced');
    expect(selectVisualQuality(20)).toBe('minimum');
    expect(qualityDprCap('minimum')).toBeLessThan(qualityDprCap('full'));
  });
});
