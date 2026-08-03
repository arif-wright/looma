import { OBSTACLE, PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, type Position } from '../simulation/movement.js';

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
};

export const WORLD_MAPS: Record<WorldMapDefinition['id'], WorldMapDefinition> = {
  'wilds-town': {
    id: 'wilds-town', version: 1, spawn: { x: 160, y: 270 },
    landmarks: [{ key: 'town-well', x: 540, y: 270, radius: 56 }],
    gatherNodes: []
  },
  'wilds-exploration': {
    id: 'wilds-exploration', version: 1, spawn: { x: 120, y: 120 },
    landmarks: [
      { key: 'moonberry-grove', x: 800, y: 120, radius: 72 },
      { key: 'ancient-grove', x: 800, y: 120, radius: 64 }
    ],
    gatherNodes: [{ key: 'moonberry-bush', landmarkKey: 'moonberry-grove', x: 800, y: 120, radius: 58 }]
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
  if (map.id === 'wilds-exploration') {
    return !(
      position.x + PLAYER_RADIUS > OBSTACLE.left && position.x - PLAYER_RADIUS < OBSTACLE.right &&
      position.y + PLAYER_RADIUS > OBSTACLE.top && position.y - PLAYER_RADIUS < OBSTACLE.bottom
    );
  }
  return true;
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
