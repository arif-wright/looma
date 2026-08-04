import { describe, expect, it } from 'vitest';
import {
  applyMovement, parseMovementIntent, PLAYER_RADIUS, WORLD_WIDTH
} from '../src/simulation/movement.js';
import { EXPLORATION_TRAVERSAL } from '../src/world/traversal.js';

const walk = (start: { x: number; y: number }, input: { x: number; y: number }, steps: number) => {
  let position = start;
  for (let index = 0; index < steps; index += 1) position = applyMovement(position, input, 100);
  return position;
};

describe('movement protocol and simulation', () => {
  it('accepts only exact, finite normalized movement intents', () => {
    expect(parseMovementIntent({ sequence: 1, x: 0.6, y: 0.8 })).toEqual({ sequence: 1, x: 0.6, y: 0.8 });
    expect(parseMovementIntent({ sequence: 1, x: 2, y: 0 })).toBeNull();
    expect(parseMovementIntent({ sequence: 1, x: 0, y: 0, position: 999 })).toBeNull();
    expect(parseMovementIntent({ sequence: 1, x: Number.NaN, y: 0 })).toBeNull();
  });

  it('bounds time steps and clamps players inside the world', () => {
    const next = applyMovement({ x: WORLD_WIDTH - PLAYER_RADIUS - 1, y: 100 }, { x: 1, y: 0 }, 50_000);
    expect(next.x).toBe(WORLD_WIDTH - PLAYER_RADIUS);
    expect(next.y).toBe(100);
  });

  it.each([
    [{ x: 17, y: 100 }, { x: -1, y: 0 }, 'x', 16],
    [{ x: 943, y: 100 }, { x: 1, y: 0 }, 'x', 944],
    [{ x: 400, y: 17 }, { x: 0, y: -1 }, 'y', 16],
    [{ x: 400, y: 523 }, { x: 0, y: 1 }, 'y', 524]
  ] as const)('enforces every walkable boundary', (position, input, axis, expected) => {
    expect(applyMovement(position, input, 100)[axis]).toBe(expected);
  });

  it.each([100, 480, 900])('crosses the east/west road north-to-south and south-to-north at x=%s', (x) => {
    expect(walk({ x, y: 180 }, { x: 0, y: 1 }, 8).y).toBeGreaterThan(322);
    expect(walk({ x, y: 360 }, { x: 0, y: -1 }, 8).y).toBeLessThan(218);
  });

  it.each(EXPLORATION_TRAVERSAL.blockers.filter((item) => item.kind === 'tree').map((item) => item.id))('blocks at visible tree %s but not beside it', (id) => {
    const blocker = EXPLORATION_TRAVERSAL.blockers.find((item) => item.id === id)!;
    const blocked = applyMovement({ x: blocker.x - blocker.radius - PLAYER_RADIUS - 1, y: blocker.y }, { x: 1, y: 0 }, 100);
    expect(blocked.x).toBe(blocker.x - blocker.radius - PLAYER_RADIUS - 1);
    const clear = applyMovement({ x: blocker.x - 60, y: blocker.y + 60 }, { x: 1, y: 0 }, 100);
    expect(clear.x).toBeGreaterThan(blocker.x - 60);
  });

  it.each(EXPLORATION_TRAVERSAL.blockers.filter((item) => item.kind === 'rock').map((item) => item.id))('blocks at visible rock %s but not beside it', (id) => {
    const blocker = EXPLORATION_TRAVERSAL.blockers.find((item) => item.id === id)!;
    const startX = blocker.x - blocker.radius - PLAYER_RADIUS - 1;
    expect(applyMovement({ x: startX, y: blocker.y }, { x: 1, y: 0 }, 100).x).toBe(startX);
    expect(applyMovement({ x: blocker.x - 60, y: blocker.y - 60 }, { x: 1, y: 0 }, 100).x).toBeGreaterThan(blocker.x - 60);
  });

  it('has no legacy central invisible obstacle', () => {
    const crossed = walk({ x: 540, y: 180 }, { x: 0, y: 1 }, 8);
    expect(crossed.y).toBeGreaterThan(322);
  });
});
