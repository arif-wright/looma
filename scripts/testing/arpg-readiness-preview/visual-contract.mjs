import { FOOTPRINTS, roomAllows, sweptDistance } from './plaza-contract.mjs';
import { COURTYARD_FOOTPRINTS } from './courtyard-graphics.mjs';

// Supplementary controlled placement only. These discontinuous poses are NOT
// a walking route, collision traversal, departure, or full-game acceptance.
export const VISUAL_MODE = 'controlled-scene-visual';
export const VISUAL_TITLES = Object.freeze([
  'desktop controlled-scene visual-only courtyard wall idle poses',
  'phone controlled-scene visual-only courtyard wall idle poses'
]);
export const VISUAL_LIMITS = Object.freeze({
  caseMs: 180000, poses: 6, captures: 6, framesPerPose: 64,
  stableComparisons: 3, cameraTolerance: 0.01, radius: 38
});
export const VISUAL_POSES = Object.freeze([
  { id: 'home', x: 1472, y: 536 },
  { id: 'west-inner', x: 1456, y: 698 },
  { id: 'east-inner', x: 1872, y: 760 },
  { id: 'inner-elbow', x: 1728, y: 832 },
  { id: 'west-front-witness', x: 1584, y: 880 },
  { id: 'east-front-witness', x: 1872, y: 880 }
].map(pose => Object.freeze(pose)));
export const VISUAL_VIEWS = Object.freeze(VISUAL_POSES.map(pose => pose.id));
export const visualScreenshot = (index, id) => `${index === 1 ? 'phone' : 'desktop'}-courtyard-visual-${id}`;
export const visualViewport = index => index === 1 ? { width: 390, height: 844 } : { width: 1280, height: 900 };
export const VISUAL_SOLIDS = Object.freeze({ ...FOOTPRINTS, west: COURTYARD_FOOTPRINTS[0], east: COURTYARD_FOOTPRINTS[1] });
export function visualClearance(pose) {
  const point = [pose?.x, pose?.y];
  if (!point.every(Number.isFinite)) return { radius: 38, room: false, distances: {}, valid: false };
  const distances = Object.fromEntries(Object.entries(VISUAL_SOLIDS).map(([name, poly]) => [name, sweptDistance(point, point, poly)]));
  const room = roomAllows(point);
  return { radius: 38, room, distances, valid: room && Object.values(distances).every(d => d > 38) };
}
export const VISUAL_CAMERA_KEYS = Object.freeze(['x', 'y', 'width', 'height', 'zoom', 'scrollX', 'scrollY']);
export function visualCameraStable(previous, current) {
  if (!previous || !current || previous.matrix?.length !== 6 || current.matrix?.length !== 6) return false;
  const a = [...VISUAL_CAMERA_KEYS.map(key => previous[key]), ...previous.matrix];
  const b = [...VISUAL_CAMERA_KEYS.map(key => current[key]), ...current.matrix];
  return a.every((value, i) => Number.isFinite(value) && Number.isFinite(b[i]) && Math.abs(value - b[i]) <= VISUAL_LIMITS.cameraTolerance);
}
