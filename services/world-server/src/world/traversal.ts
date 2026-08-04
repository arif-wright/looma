import manifestJson from './traversalManifest.json' with { type: 'json' };

export type Position = { x: number; y: number };
export type CircleBlocker = {
  id: string;
  kind: 'tree' | 'rock';
  shape: 'circle';
  x: number;
  y: number;
  radius: number;
};
export type TraversalDefinition = {
  version: number;
  mapId: 'wilds-exploration';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  spawn: Position;
  blockers: readonly CircleBlocker[];
};

export const EXPLORATION_TRAVERSAL = manifestJson as TraversalDefinition;

export const overlapsBlocker = (position: Position, playerRadius: number, blocker: CircleBlocker) =>
  Math.hypot(position.x - blocker.x, position.y - blocker.y) < playerRadius + blocker.radius;

export const blockerAtPosition = (definition: TraversalDefinition, position: Position, playerRadius: number) =>
  definition.blockers.find((blocker) => overlapsBlocker(position, playerRadius, blocker)) ?? null;
