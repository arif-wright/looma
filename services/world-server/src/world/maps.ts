import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from '../simulation/movement.js';
import { EXPLORATION_TRAVERSAL, blockerAtPosition, type Position, type TraversalDefinition } from './traversal.js';

export type WorldLandmarkDefinition = {
  key: string;
  x: number;
  y: number;
  radius: number;
};

export type WorldGatherNodeDefinition = {
  key: 'moonberry-bush';
  landmarkKey: 'moonberry-grove';
  x: number;
  y: number;
  radius: number;
};

export type WorldMapDefinition = {
  id: 'wilds-town' | 'wilds-exploration';
  version: number;
  spawn: Position;
  landmarks: readonly WorldLandmarkDefinition[];
  gatherNodes: readonly WorldGatherNodeDefinition[];
  traversal: TraversalDefinition | null;
};

export const WORLD_MAPS: Record<WorldMapDefinition['id'], WorldMapDefinition> = {
  'wilds-town': {
    id: 'wilds-town', version: 1, spawn: { x: 160, y: 270 },
    landmarks: [{ key: 'town-well', x: 540, y: 270, radius: 56 }],
    gatherNodes: [], traversal: null
  },
  'wilds-exploration': {
    id: 'wilds-exploration', version: 1, spawn: { x: 120, y: 120 },
    landmarks: [
      { key: 'moonberry-grove', x: 800, y: 120, radius: 72 },
      { key: 'ancient-grove', x: 800, y: 120, radius: 64 }
    ],
    gatherNodes: [{ key: 'moonberry-bush', landmarkKey: 'moonberry-grove', x: 800, y: 120, radius: 58 }],
    traversal: EXPLORATION_TRAVERSAL
  }
};

export const isWorldMapId = (value: string): value is WorldMapDefinition['id'] =>
  Object.prototype.hasOwnProperty.call(WORLD_MAPS, value);

export const isValidWorldPosition = (map: WorldMapDefinition, position: Position) => {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  if (
    position.x < PLAYER_RADIUS || position.x > WORLD_WIDTH - PLAYER_RADIUS ||
    position.y < PLAYER_RADIUS || position.y > WORLD_HEIGHT - PLAYER_RADIUS
  ) return false;
  return !map.traversal || !blockerAtPosition(map.traversal, position, PLAYER_RADIUS);
};

export const restoreWorldPosition = (
  map: WorldMapDefinition,
  saved: { mapId: unknown; mapVersion: unknown; x: unknown; y: unknown }
) => {
  const position = { x: Number(saved.x), y: Number(saved.y) };
  const restored = saved.mapId === map.id && saved.mapVersion === map.version && isValidWorldPosition(map, position);
  return { position: restored ? position : { ...map.spawn }, restored };
};

export const landmarkAtPosition = (map: WorldMapDefinition, position: Position) =>
  map.landmarks.find((landmark) => Math.hypot(position.x - landmark.x, position.y - landmark.y) <= landmark.radius) ?? null;

export const gatherNodeAtPosition = (map: WorldMapDefinition, nodeKey: unknown, position: Position) => {
  if (typeof nodeKey !== 'string') return null;
  return map.gatherNodes.find((node) =>
    node.key === nodeKey && Math.hypot(position.x - node.x, position.y - node.y) <= node.radius
  ) ?? null;
};
