import { describe, expect, it } from 'vitest';
import {
  applyMovement, parseMovementIntent, PLAYER_RADIUS, WORLD_WIDTH
} from '../src/simulation/movement.js';

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

  it('does not allow movement through the central obstacle', () => {
    const next = applyMovement({ x: 448, y: 270 }, { x: 1, y: 0 }, 100);
    expect(next.x).toBe(448);
  });
});
