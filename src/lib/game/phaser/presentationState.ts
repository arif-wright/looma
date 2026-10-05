import type { TraversalManifest } from '../traversal';
import { getWorldArea } from '../areas';

export const sameArea = (mapId: string | undefined, currentMapId: string) => getWorldArea(mapId).id === currentMapId;

/** Feet position is a radius-16 circle, identical to server simulation. */
export const predictAreaMovement = (position: { x: number; y: number }, direction: { x: number; y: number }, deltaMs: number,
  speed: number, traversal: TraversalManifest) => {
  const distance = speed * Math.max(0, Math.min(deltaMs, 100)) / 1000;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const blocked = (candidate: { x: number; y: number }) => traversal.blockers.some((blocker) => Math.hypot(candidate.x - blocker.x, candidate.y - blocker.y) < blocker.radius + 16);
  const next = { ...position };
  const candidateX = { x: clamp(position.x + direction.x * distance, traversal.bounds.minX, traversal.bounds.maxX), y: position.y };
  if (!blocked(candidateX)) next.x = candidateX.x;
  const candidateY = { x: next.x, y: clamp(position.y + direction.y * distance, traversal.bounds.minY, traversal.bounds.maxY) };
  if (!blocked(candidateY)) next.y = candidateY.y;
  return next;
};
