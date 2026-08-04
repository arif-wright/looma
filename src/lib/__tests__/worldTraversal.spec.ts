import { describe, expect, it } from 'vitest';
import { cameraRelativeMovement, serverToWorld, worldToServer } from '$lib/game/renderers/three/math';
import { WORLD_TRAVERSAL } from '$lib/game/traversal';

describe('renderer-neutral world traversal manifest', () => {
  it('contains only visible circular tree/rock blockers and no legacy center rectangle', () => {
    expect(WORLD_TRAVERSAL.blockers).toHaveLength(8);
    expect(WORLD_TRAVERSAL.blockers.every((blocker) => blocker.shape === 'circle')).toBe(true);
    expect(WORLD_TRAVERSAL.blockers.some((blocker) => blocker.x === 540 && blocker.y === 270)).toBe(false);
  });

  it('round-trips every authoritative blocker into Three coordinates', () => {
    for (const blocker of WORLD_TRAVERSAL.blockers) {
      const world = serverToWorld(blocker.x, blocker.y);
      expect(worldToServer(world.x, world.z)).toEqual({ x: blocker.x, y: blocker.y });
    }
  });

  it('keeps collision coordinates world-relative when the camera rotates', () => {
    const blocker = WORLD_TRAVERSAL.blockers[0];
    const northAtClassicYaw = cameraRelativeMovement(0, -1, 0);
    const northAfterQuarterTurn = cameraRelativeMovement(1, 0, Math.PI / 2);
    expect(blocker).toEqual(WORLD_TRAVERSAL.blockers[0]);
    expect(northAfterQuarterTurn.x).toBeCloseTo(northAtClassicYaw.x);
    expect(northAfterQuarterTurn.y).toBeCloseTo(northAtClassicYaw.y);
  });
});
