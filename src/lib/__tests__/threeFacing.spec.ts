import { describe, expect, it } from 'vitest';
import { classifyFacing, FacingState } from '$lib/game/facing';

describe('8-direction world facing', () => {
  it.each([
    [0, -1, 'n'], [1, -1, 'ne'], [1, 0, 'e'], [1, 1, 'se'],
    [0, 1, 's'], [-1, 1, 'sw'], [-1, 0, 'w'], [-1, -1, 'nw']
  ] as const)('classifies (%s, %s) as %s', (x, z, expected) => {
    expect(classifyFacing(x, z)).toBe(expected);
  });

  it('retains last non-zero facing while idle and ignores camera angle', () => {
    const facing = new FacingState('s');
    expect(facing.update(-1, 0)).toBe('w');
    expect(facing.update(0.00001, 0.00001)).toBe('w');
    for (const cameraYaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      expect(classifyFacing(1, -1)).toBe('ne');
      expect(cameraYaw).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps world-facing unchanged while the camera rotates', () => {
    const north = classifyFacing(0, -1);
    for (const cameraYaw of [0, Math.PI / 4, Math.PI, Math.PI * 7 / 4]) {
      expect(classifyFacing(0, -1)).toBe(north);
      expect(cameraYaw).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses deterministic 22.5-degree sector boundaries', () => {
    const angle = 22.49 * Math.PI / 180;
    expect(classifyFacing(Math.sin(angle), -Math.cos(angle))).toBe('n');
    const next = 22.51 * Math.PI / 180;
    expect(classifyFacing(Math.sin(next), -Math.cos(next))).toBe('ne');
  });
});
