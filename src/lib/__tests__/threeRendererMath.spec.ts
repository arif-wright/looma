import { describe, expect, it } from 'vitest';
import { OrbitCameraState } from '$lib/game/renderers/three/cameraController';
import {
  CAMERA_LIMITS,
  DEFAULT_CAMERA,
  cameraRelativeMovement,
  serverToWorld,
  worldToServer
} from '$lib/game/renderers/three/math';

describe('Three world coordinate and camera contracts', () => {
  it('round-trips server X/Y through world X/Z', () => {
    const world = serverToWorld(800, 120);
    expect(worldToServer(world.x, world.z)).toEqual({ x: 800, y: 120 });
  });

  it.each([
    [0, { x: 0, y: -1 }],
    [Math.PI / 2, { x: -1, y: 0 }],
    [Math.PI, { x: 0, y: 1 }]
  ])('converts forward input at yaw %s into normalized server intent', (yaw, expected) => {
    const result = cameraRelativeMovement(0, -1, yaw);
    expect(result.x).toBeCloseTo(expected.x, 6);
    expect(result.y).toBeCloseTo(expected.y, 6);
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(1, 6);
  });

  it('clamps pitch and zoom and resets every camera value', () => {
    const camera = new OrbitCameraState();
    camera.orbit(1, 100);
    camera.adjustZoom(100);
    expect(camera.pitch).toBe(CAMERA_LIMITS.pitchMax);
    expect(camera.zoom).toBe(CAMERA_LIMITS.zoomMax);
    camera.orbit(0, -200);
    camera.adjustZoom(-200);
    expect(camera.pitch).toBe(CAMERA_LIMITS.pitchMin);
    expect(camera.zoom).toBe(CAMERA_LIMITS.zoomMin);
    camera.reset();
    expect(camera).toMatchObject(DEFAULT_CAMERA);
  });
});
