import { World } from './components';

export const movementSystem = (world: World, deltaMs: number) => {
  const dt = deltaMs / 1000;
  if (!Number.isFinite(dt) || dt <= 0) return;

  world.forEachMovement((_entity, transform, velocity) => {
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > velocity.maxSpeed && speed > 0) {
      const scale = velocity.maxSpeed / speed;
      velocity.x *= scale;
      velocity.y *= scale;
    }

    transform.x += velocity.x * dt;
    transform.y += velocity.y * dt;

    const damping = Math.min(0.999, Math.max(0, velocity.damping));
    velocity.x *= damping;
    velocity.y *= damping;
  });
};

export const dashSystem = (world: World, deltaMs: number) => {
  world.forEachDash((_entity, dash, velocity) => {
    dash.remainingCooldown = Math.max(0, dash.remainingCooldown - deltaMs);

    if (dash.isDashing) {
      dash.remainingDuration = Math.max(0, dash.remainingDuration - deltaMs);
      if (dash.remainingDuration === 0) {
        dash.isDashing = false;
      }
      return;
    }

    if (!dash.queuedDirection || dash.remainingCooldown > 0 || !velocity) {
      return;
    }

    velocity.x = dash.queuedDirection.x * dash.speed;
    velocity.y = dash.queuedDirection.y * dash.speed;
    dash.isDashing = true;
    dash.remainingDuration = dash.durationMs;
    dash.remainingCooldown = dash.cooldownMs;
    dash.queuedDirection = null;
  });
};
