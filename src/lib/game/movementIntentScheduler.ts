import type { MovementIntent } from './protocol';

export const MOVEMENT_HEARTBEAT_MS = 100;

export class MovementIntentScheduler {
  private elapsed = 0;
  private sequence = 0;
  private lastX = 0;
  private lastY = 0;

  next(x: number, y: number, deltaMs: number): MovementIntent | null {
    this.elapsed += Math.min(Math.max(deltaMs, 0), MOVEMENT_HEARTBEAT_MS);
    const changed = x !== this.lastX || y !== this.lastY;
    const moving = x !== 0 || y !== 0;
    if (!changed && (!moving || this.elapsed < MOVEMENT_HEARTBEAT_MS)) return null;

    this.elapsed = 0;
    this.lastX = x;
    this.lastY = y;
    return { sequence: ++this.sequence, x, y };
  }
}
