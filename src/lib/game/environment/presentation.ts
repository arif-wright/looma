import { wrapAngle } from '../renderers/three/math';
import type { EnvironmentAssetDefinition } from './contract';

export const ENVIRONMENT_RENDER_CLASSES = [
  'terrain-surface',
  'directional-impostor',
  'upright-billboard',
  'ground-prop',
  'ground-detail',
  'fx-decorated-prop',
  'particles'
] as const;

export type EnvironmentRenderClass = (typeof ENVIRONMENT_RENDER_CLASSES)[number];
export type EnvironmentLod = 'near' | 'mid' | 'far';
export const ENVIRONMENT_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type EnvironmentDirection = (typeof ENVIRONMENT_DIRECTIONS)[number];
// atan2(cameraX, cameraZ): +Z is world south, +X is world east.
export const ENVIRONMENT_CAMERA_SECTOR_DIRECTIONS: readonly EnvironmentDirection[] =
  ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];

// Version-1 manifests predate explicit render classes. This is the sole compatibility
// boundary; version-2 production assets must declare their class in data.
export const resolveEnvironmentRenderClass = (asset: EnvironmentAssetDefinition): EnvironmentRenderClass => {
  if (asset.renderClass) return asset.renderClass;
  if (asset.renderer === 'surface') return 'terrain-surface';
  if (asset.renderer === 'particles') return 'particles';
  if (asset.category === 'tree') return 'directional-impostor';
  if (asset.category === 'rock') return 'ground-prop';
  if (asset.category === 'magical') return 'fx-decorated-prop';
  if (asset.layer === 'low-vegetation') return 'upright-billboard';
  return 'ground-detail';
};

const STEP = Math.PI / 4;

export const cameraRelativeEnvironmentAngle = (
  cameraX: number,
  cameraZ: number,
  objectX: number,
  objectZ: number,
  objectYaw = 0
) => wrapAngle(Math.atan2(cameraX - objectX, cameraZ - objectZ) - objectYaw);

/** Orthographic authored-view azimuth: every screen ray is parallel to camera forward. */
export const cameraForwardEnvironmentAngle = (
  cameraForwardX: number,
  cameraForwardZ: number,
  objectYaw = 0
) => wrapAngle(Math.atan2(-cameraForwardX, -cameraForwardZ) - objectYaw);

export const resolveEnvironmentDirection = (
  angle: number,
  previous?: EnvironmentDirection,
  hysteresisRadians = Math.PI / 36
): EnvironmentDirection => {
  const normalized = wrapAngle(angle);
  if (previous) {
    const previousIndex = ENVIRONMENT_CAMERA_SECTOR_DIRECTIONS.indexOf(previous);
    const center = previousIndex * STEP;
    const delta = Math.abs(Math.atan2(Math.sin(normalized - center), Math.cos(normalized - center)));
    if (delta <= STEP / 2 + hysteresisRadians) return previous;
  }
  return ENVIRONMENT_CAMERA_SECTOR_DIRECTIONS[Math.round(normalized / STEP) % ENVIRONMENT_CAMERA_SECTOR_DIRECTIONS.length]!;
};

export const resolveEnvironmentLod = (distance: number, midDistance: number, farDistance: number): EnvironmentLod => {
  if (distance >= farDistance) return 'far';
  if (distance >= midDistance) return 'mid';
  return 'near';
};

/** World-space yaw for an upright plane whose +Z normal faces the camera. */
export const cylindricalBillboardYaw = (
  cameraX: number,
  cameraZ: number,
  objectX: number,
  objectZ: number
) => Math.atan2(cameraX - objectX, cameraZ - objectZ);

/** Environment LOD is ground-plane distance; camera elevation must not demote props. */
export const horizontalEnvironmentDistance = (
  cameraX: number,
  cameraZ: number,
  objectX: number,
  objectZ: number
) => Math.hypot(cameraX - objectX, cameraZ - objectZ);

/** Translate centered plane geometry so an image-space (top-left) anchor is its origin. */
export const anchoredPlaneTranslation = (
  width: number,
  height: number,
  anchor: { x: number; y: number }
) => ({ x: (0.5 - anchor.x) * width, y: (anchor.y - 0.5) * height });
