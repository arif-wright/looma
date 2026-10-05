import areas from '../../../services/world-server/src/world/areas.json';
import groveTraversal from '../../../services/world-server/src/world/traversalManifest.json';
import hollowTraversal from '../../../services/world-server/src/world/hollowTraversalManifest.json';
import type { TraversalManifest } from './traversal';

export type WorldAreaId = 'wilds-exploration' | 'wilds-town';
export type WorldPortal = {
  id: 'grove-to-hollow' | 'hollow-to-grove';
  x: number; y: number; radius: number;
  targetMapId: WorldAreaId; targetName: string;
  arrival: { x: number; y: number };
};
export type WorldArea = {
  id: WorldAreaId; name: string; subtitle: string;
  portal: WorldPortal; traversal: TraversalManifest;
};
export const WORLD_AREAS = {
  'wilds-exploration': { ...areas['wilds-exploration'], traversal: groveTraversal },
  'wilds-town': { ...areas['wilds-town'], traversal: hollowTraversal }
} as Record<WorldAreaId, WorldArea>;
export const isWorldAreaId = (id: unknown): id is WorldAreaId => id === 'wilds-exploration' || id === 'wilds-town';
export const getWorldArea = (id?: string): WorldArea => WORLD_AREAS[isWorldAreaId(id) ? id : 'wilds-exploration'];
export const portalAtPosition = (mapId: string | undefined, position: { x: number; y: number }) => {
  const portal = getWorldArea(mapId).portal;
  return Math.hypot(position.x - portal.x, position.y - portal.y) <= portal.radius ? portal : null;
};
