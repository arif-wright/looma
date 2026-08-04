import { describe, expect, it } from 'vitest';
import { MovementIntentScheduler } from '$lib/game/movementIntentScheduler';

describe('MovementIntentScheduler', () => {
  it('does not send repeated idle intents', () => {
    const scheduler = new MovementIntentScheduler();
    expect(scheduler.next(0, 0, 1_000)).toBeNull();
    expect(scheduler.next(0, 0, 1_000)).toBeNull();
  });

  it('sends direction changes and stops immediately', () => {
    const scheduler = new MovementIntentScheduler();
    expect(scheduler.next(1, 0, 16)).toEqual({ sequence: 1, x: 1, y: 0 });
    expect(scheduler.next(1, 0, 16)).toBeNull();
    expect(scheduler.next(0, 0, 16)).toEqual({ sequence: 2, x: 0, y: 0 });
  });

  it('limits unchanged moving heartbeats to ten per second', () => {
    const scheduler = new MovementIntentScheduler();
    const intents = [scheduler.next(1, 0, 0)];
    for (let elapsed = 10; elapsed <= 1_000; elapsed += 10) {
      intents.push(scheduler.next(1, 0, 10));
    }
    expect(intents.filter(Boolean)).toHaveLength(11);
  });
});
