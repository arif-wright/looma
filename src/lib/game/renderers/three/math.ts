import { normalizeMovement, WORLD_HEIGHT, WORLD_WIDTH } from '../../config';

export const SERVER_UNITS_PER_WORLD_UNIT = 32;
export const DEFAULT_CAMERA = { yaw: Math.PI / 4, pitch: Math.PI / 4, zoom: 1 } as const;
export const CAMERA_LIMITS = {
  pitchMin: Math.PI * 25 / 180,
  pitchMax: Math.PI * 65 / 180,
  zoomMin: 0.65,
  zoomMax: 1.8
} as const;

export const serverToWorld = (x: number, y: number) => ({
  x: (x - WORLD_WIDTH / 2) / SERVER_UNITS_PER_WORLD_UNIT,
  z: (y - WORLD_HEIGHT / 2) / SERVER_UNITS_PER_WORLD_UNIT
});

export const worldToServer = (x: number, z: number) => ({
  x: x * SERVER_UNITS_PER_WORLD_UNIT + WORLD_WIDTH / 2,
  y: z * SERVER_UNITS_PER_WORLD_UNIT + WORLD_HEIGHT / 2
});

export const cameraRelativeMovement = (inputX: number, inputY: number, yaw: number) => {
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  return normalizeMovement(
    inputX * rightX + -inputY * forwardX,
    inputX * rightZ + -inputY * forwardZ
  );
};

export const clampPitch = (pitch: number) =>
  Math.min(CAMERA_LIMITS.pitchMax, Math.max(CAMERA_LIMITS.pitchMin, pitch));
export const clampZoom = (zoom: number) =>
  Math.min(CAMERA_LIMITS.zoomMax, Math.max(CAMERA_LIMITS.zoomMin, zoom));
