export type EntityId = number;

export type Vec2 = {
  x: number;
  y: number;
};

export const ZERO_VEC: Vec2 = { x: 0, y: 0 };

export type Transform = {
  x: number;
  y: number;
  rot: number;
};

export type Velocity = {
  vx: number;
  vy: number;
  speed: number;
};

export type Player = {
  score: number;
};

export type Enemy = {
  speed: number;
  chaseRadius: number;
  attackRange: number;
  attackDelay: number;
  damage: number;
  timer: number;
};

export type Health = {
  max: number;
  current: number;
};

export type Dash = {
  cd: number;
  cdMax: number;
  power: number;
  duration: number;
  timer: number;
  lastDir: Vec2;
};

export class World {
  private nextEntityId = 1;
  private transforms = new Map<EntityId, Transform>();
  private velocities = new Map<EntityId, Velocity>();
  private health = new Map<EntityId, Health>();
  private dashes = new Map<EntityId, Dash>();
  private players = new Set<EntityId>();
  private enemies = new Set<EntityId>();

  createEntity(): EntityId {
    return this.nextEntityId++;
  }

  destroyEntity(entity: EntityId) {
    this.transforms.delete(entity);
    this.velocities.delete(entity);
    this.health.delete(entity);
    this.dashes.delete(entity);
    this.players.delete(entity);
    this.enemies.delete(entity);
    this.metadata.delete(entity);
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

  tagPlayer(entity: EntityId, player: Player) {
    this.players.add(entity);
    this.setMetadata(entity, player);
  }

  tagEnemy(entity: EntityId, enemy: Enemy) {
    this.enemies.add(entity);
    this.setMetadata(entity, enemy);
  }

  private metadata = new Map<EntityId, unknown>();

  private setMetadata(entity: EntityId, payload: unknown) {
    this.metadata.set(entity, payload);
  }

  getPlayer(entity: EntityId): Player | undefined {
    return this.players.has(entity) ? (this.metadata.get(entity) as Player) : undefined;
  }

  getEnemy(entity: EntityId): Enemy | undefined {
    return this.enemies.has(entity) ? (this.metadata.get(entity) as Enemy) : undefined;
  }

  getPlayers() {
    return Array.from(this.players);
  }

  getEnemies() {
    return Array.from(this.enemies);
  }

  getTransform(entity: EntityId) {
    return this.transforms.get(entity);
  }

  getVelocity(entity: EntityId) {
    return this.velocities.get(entity);
  }

  getHealth(entity: EntityId) {
    return this.health.get(entity);
  }

  getDash(entity: EntityId) {
    return this.dashes.get(entity);
  }

  forEachMovement(handler: (entity: EntityId, transform: Transform, velocity: Velocity) => void) {
    this.transforms.forEach((transform, entity) => {
      const velocity = this.velocities.get(entity);
      if (!velocity) return;
      handler(entity, transform, velocity);
    });
  }

  forEachTransform(handler: (entity: EntityId, transform: Transform) => void) {
    this.transforms.forEach((transform, entity) => handler(entity, transform));
  }

  forEachDash(handler: (entity: EntityId, dash: Dash, velocity: Velocity | undefined) => void) {
    this.dashes.forEach((dash, entity) => handler(entity, dash, this.velocities.get(entity)));
  }
}
