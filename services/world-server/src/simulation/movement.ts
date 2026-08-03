import type { MovementIntent } from '../protocol.js';

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 220;
export const MAX_STEP_MS = 100;
export const OBSTACLE = { left: 465, right: 615, top: 212, bottom: 328 } as const;

export type Position = { x: number; y: number };

export const parseMovementIntent = (value: unknown): MovementIntent | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.some((key) => !['sequence', 'x', 'y'].includes(key))) return null;
  if (
    !Number.isSafeInteger(input.sequence) ||
    (input.sequence as number) < 0 ||
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y)
  ) {
    return null;
  }
  const x = input.x as number;
  const y = input.y as number;
  if (x < -1 || x > 1 || y < -1 || y > 1) return null;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1.001) return null;
  return { sequence: input.sequence as number, x, y };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const overlapsObstacle = (position: Position) =>
  position.x + PLAYER_RADIUS > OBSTACLE.left &&
  position.x - PLAYER_RADIUS < OBSTACLE.right &&
  position.y + PLAYER_RADIUS > OBSTACLE.top &&
  position.y - PLAYER_RADIUS < OBSTACLE.bottom;

export const applyMovement = (position: Position, input: Pick<MovementIntent, 'x' | 'y'>, deltaMs: number) => {
  const boundedDelta = Math.max(0, Math.min(MAX_STEP_MS, Number.isFinite(deltaMs) ? deltaMs : 0));
  const distance = PLAYER_SPEED * (boundedDelta / 1000);
  const next = { ...position };

  const candidateX = {
    x: clamp(position.x + input.x * distance, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS),
    y: position.y
  };
  if (!overlapsObstacle(candidateX)) next.x = candidateX.x;

  const candidateY = {
    x: next.x,
    y: clamp(position.y + input.y * distance, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS)
  };
  if (!overlapsObstacle(candidateY)) next.y = candidateY.y;

  return next;
};
