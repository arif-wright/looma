import areas from './areas.json' with { type: 'json' };
import { WORLD_MAPS, isWorldMapId, isValidWorldPosition, type WorldMapDefinition } from './maps.js';

export type PortalRequest = { requestId: string; portalId: 'grove-to-hollow' | 'hollow-to-grove' };
export const PORTAL_COOLDOWN_MS = 1_500;
export const WORLD_AREAS = areas;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const parsePortalRequest = (value: unknown): PortalRequest | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (Object.keys(request).length !== 2 || typeof request.requestId !== 'string' || !UUID_V4.test(request.requestId)) return null;
  if (request.portalId !== 'grove-to-hollow' && request.portalId !== 'hollow-to-grove') return null;
  return { requestId: request.requestId, portalId: request.portalId };
};
export const resolvePortal = (map: WorldMapDefinition, portalId: string, position: { x: number; y: number }) => {
  const portal = areas[map.id].portal;
  if (portal.id !== portalId || !isValidWorldPosition(map, position)) return null;
  if (Math.hypot(position.x - portal.x, position.y - portal.y) > portal.radius) return null;
  if (!isWorldMapId(portal.targetMapId)) return null;
  const destination = WORLD_MAPS[portal.targetMapId];
  if (!isValidWorldPosition(destination, portal.arrival)) return null;
  return { portal, destination, arrival: { ...portal.arrival } };
};
