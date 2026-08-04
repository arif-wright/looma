import manifestJson from '../../../services/world-server/src/world/traversalManifest.json';

export type TraversalBlocker = {
  id: string;
  kind: 'tree' | 'rock';
  shape: 'circle';
  x: number;
  y: number;
  radius: number;
};

export type TraversalManifest = {
  version: number;
  mapId: 'wilds-exploration';
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  spawn: { x: number; y: number };
  blockers: readonly TraversalBlocker[];
};

// Public, renderer-neutral projection of the authoritative server-owned manifest.
export const WORLD_TRAVERSAL = manifestJson as TraversalManifest;
export const MOONBERRY_INTERACTION = { x: 800, y: 120, radius: 58 } as const;
