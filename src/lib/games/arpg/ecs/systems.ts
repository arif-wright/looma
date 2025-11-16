import type { Dash, EntityId, Vec2 } from './components';
import { World } from './components';

export const movementSystem = (world: World, deltaMs: number) => {
  const dt = deltaMs / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return;

  world.forEachMovement((_entity, transform, velocity) => {
    const mag = Math.hypot(velocity.vx, velocity.vy);
    if (mag > velocity.speed && mag > 0) {
      const scale = velocity.speed / Math.max(1, mag);
      velocity.vx *= scale;
      velocity.vy *= scale;
    }

    transform.x += velocity.vx * dt;
    transform.y += velocity.vy * dt;

    const friction = 0.88;
    velocity.vx *= friction;
    velocity.vy *= friction;
  });
};

export type DashInput = {
  entity: EntityId;
  dash: boolean;
  direction: Vec2;
};

export type DashResult =
  | {
      activated: true;
      entity: EntityId;
      direction: Vec2;
    }
  | { activated: false };

const normalize = (vec: Vec2): Vec2 => {
  const mag = Math.hypot(vec.x, vec.y);
  if (!Number.isFinite(mag) || mag === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vec.x / mag, y: vec.y / mag };
};

export const dashSystem = (
  world: World,
  deltaMs: number,
  input?: DashInput
): DashResult | undefined => {
  let result: DashResult | undefined;

  world.forEachDash((entity, dash, velocity) => {
    dash.cd = Math.max(0, dash.cd - deltaMs);
    dash.timer = Math.max(0, dash.timer - deltaMs);

    if (!input || input.entity !== entity) {
      return;
    }

    if (!input.dash || dash.cd > 0) {
      result = { activated: false };
      return;
    }

    const intent = normalize(input.direction);
    const dir = intent.x === 0 && intent.y === 0 ? dash.lastDir : intent;
    if (dir.x === 0 && dir.y === 0) {
      result = { activated: false };
      return;
    }

    const transform = world.getTransform(entity);
    if (!transform) {
      result = { activated: false };
      return;
    }

    transform.x += dir.x * dash.power;
    transform.y += dir.y * dash.power;
    dash.cd = dash.cdMax;
    dash.timer = dash.duration;
    dash.lastDir = { ...dir };
    if (velocity) {
      velocity.vx = dir.x * dash.power * 2.2;
      velocity.vy = dir.y * dash.power * 2.2;
    }

    result = { activated: true, entity, direction: dir };
  });

  return result;
};
