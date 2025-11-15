export type EntityId = number;

export type Vec2 = {
  x: number;
  y: number;
};

export const ZERO_VEC: Vec2 = { x: 0, y: 0 };

export type Transform = {
  x: number;
  y: number;
  rotation: number;
};

export type Velocity = {
  x: number;
  y: number;
  maxSpeed: number;
  damping: number;
};

export type Health = {
  max: number;
  current: number;
};

export type Dash = {
  speed: number;
  durationMs: number;
  cooldownMs: number;
  remainingCooldown: number;
  remainingDuration: number;
  isDashing: boolean;
  queuedDirection: Vec2 | null;
};

export class World {
  private nextEntityId = 1;
  private transforms = new Map<EntityId, Transform>();
  private velocities = new Map<EntityId, Velocity>();
  private health = new Map<EntityId, Health>();
  private dashes = new Map<EntityId, Dash>();

  createEntity(): EntityId {
    return this.nextEntityId++;
  }

  destroyEntity(entity: EntityId) {
    this.transforms.delete(entity);
    this.velocities.delete(entity);
    this.health.delete(entity);
    this.dashes.delete(entity);
  }

  setTransform(entity: EntityId, transform: Transform) {
    this.transforms.set(entity, { ...transform });
  }

  setVelocity(entity: EntityId, velocity: Velocity) {
    this.velocities.set(entity, { ...velocity });
  }

  setHealth(entity: EntityId, health: Health) {
    this.health.set(entity, { ...health });
  }

  setDash(entity: EntityId, dash: Dash) {
    this.dashes.set(entity, { ...dash });
  }

  getTransform(entity: EntityId): Transform | undefined {
    return this.transforms.get(entity);
  }

  getVelocity(entity: EntityId): Velocity | undefined {
    return this.velocities.get(entity);
  }

  getHealth(entity: EntityId): Health | undefined {
    return this.health.get(entity);
  }

  getDash(entity: EntityId): Dash | undefined {
    return this.dashes.get(entity);
  }

  queueDash(entity: EntityId, direction: Vec2) {
    const dash = this.dashes.get(entity);
    if (!dash) return;
    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude === 0) return;
    dash.queuedDirection = { x: direction.x / magnitude, y: direction.y / magnitude };
  }

  forEachMovement(handler: (entity: EntityId, transform: Transform, velocity: Velocity) => void) {
    this.transforms.forEach((transform, entity) => {
      const velocity = this.velocities.get(entity);
      if (!velocity) return;
      handler(entity, transform, velocity);
    });
  }

  forEachDash(
    handler: (entity: EntityId, dash: Dash, velocity: Velocity | undefined) => void
  ) {
    this.dashes.forEach((dash, entity) => {
      handler(entity, dash, this.velocities.get(entity));
    });
  }
}
