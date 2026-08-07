import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS, OrbitCameraState, parseCameraReviewState } from '$lib/game/renderers/three/cameraController';
import {
  CAMERA_LIMITS,
  DEFAULT_CAMERA,
  cameraRelativeMovement,
  serverToWorld,
  worldMovementToScreen,
  worldToServer
} from '$lib/game/renderers/three/math';
import { parseMuseAnimationOverride } from '$lib/game/renderers/three/threeWorld';

describe('Three world coordinate and camera contracts', () => {
  it('accepts every explicit Muse inspector combination and rejects unrelated values', () => {
    for (const state of ['idle', 'walk'] as const) for (const facing of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const) {
      expect(parseMuseAnimationOverride(`${state}.${facing}`)).toEqual({ state, facing });
    }
    expect(parseMuseAnimationOverride('walk.up')).toBeNull();
    expect(parseMuseAnimationOverride(null)).toBeNull();
  });
  it('round-trips server X/Y through world X/Z', () => {
    const world = serverToWorld(800, 120);
    expect(worldToServer(world.x, world.z)).toEqual({ x: 800, y: 120 });
  });

  it.each([
    [0, { x: 0, y: -1 }],
    [Math.PI / 4, { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }],
    [Math.PI / 2, { x: -1, y: 0 }],
    [Math.PI * 3 / 4, { x: -Math.SQRT1_2, y: Math.SQRT1_2 }],
    [Math.PI, { x: 0, y: 1 }]
    ,[Math.PI * 5 / 4, { x: Math.SQRT1_2, y: Math.SQRT1_2 }]
    ,[Math.PI * 3 / 2, { x: 1, y: 0 }]
    ,[Math.PI * 7 / 4, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }]
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
    expect(camera.targetPitch).toBe(CAMERA_LIMITS.pitchMax);
    expect(camera.targetZoom).toBe(CAMERA_LIMITS.zoomMax);
    camera.orbit(0, -200);
    camera.adjustZoom(-200);
    expect(camera.targetPitch).toBe(CAMERA_LIMITS.pitchMin);
    expect(camera.targetZoom).toBe(CAMERA_LIMITS.zoomMin);
    camera.reset();
    expect(camera.targetYaw).toBe(DEFAULT_CAMERA.yaw);
    expect(camera.targetPitch).toBe(CAMERA_PRESETS.classic.pitch);
    expect(camera.targetZoom).toBe(CAMERA_PRESETS.classic.zoom);
  });

  it('keeps the illustrated camera inside the reviewed 30°–58° pitch envelope', () => {
    expect(CAMERA_LIMITS.pitchMin * 180 / Math.PI).toBeCloseTo(30, 8);
    expect(CAMERA_LIMITS.pitchMax * 180 / Math.PI).toBeCloseTo(58, 8);
    expect(CAMERA_PRESETS.adventurer.pitch * 180 / Math.PI).toBeCloseTo(38, 8);
  });

  it('supports deterministic development camera review angles while retaining clamps', () => {
    const camera = new OrbitCameraState();
    camera.applyReviewState(parseCameraReviewState(new URLSearchParams('worldCameraYaw=180&worldCameraPitch=90&worldCameraZoom=9')));
    expect(camera.yaw).toBeCloseTo(Math.PI, 8);
    expect(camera.pitch).toBe(CAMERA_LIMITS.pitchMax);
    expect(camera.zoom).toBe(CAMERA_LIMITS.zoomMax);
  });

  it('interpolates reset smoothly and crosses yaw wraparound by the shortest path', () => {
    const camera = new OrbitCameraState();
    camera.yaw = Math.PI * 2 - 0.01;
    camera.targetYaw = 0.01;
    camera.update(1 / 60);
    expect(camera.yaw < 0.05 || camera.yaw > Math.PI * 2 - 0.05).toBe(true);
    camera.orbit(2, 0);
    camera.update(1 / 60);
    const beforeReset = camera.yaw;
    camera.reset();
    expect(camera.yaw).toBe(beforeReset);
    camera.update(1 / 60);
    expect(camera.yaw).not.toBe(beforeReset);
  });

  it('defines complete safe camera presets', () => {
    expect(Object.keys(CAMERA_PRESETS)).toEqual(['classic', 'adventurer', 'wide', 'close']);
    for (const preset of Object.values(CAMERA_PRESETS)) {
      expect(preset.pitch).toBeGreaterThanOrEqual(CAMERA_LIMITS.pitchMin);
      expect(preset.pitch).toBeLessThanOrEqual(CAMERA_LIMITS.pitchMax);
      expect(preset.zoom).toBeGreaterThanOrEqual(CAMERA_LIMITS.zoomMin);
      expect(preset.zoom).toBeLessThanOrEqual(CAMERA_LIMITS.zoomMax);
      expect(preset.followSmoothing).toBeGreaterThan(0);
      expect(preset.yaw).toBe(0);
    }
  });

  it('starts Classic cardinal-aligned with north at screen top and east at screen right', () => {
    const camera = new OrbitCameraState('classic');
    expect(camera.yaw).toBe(0);
    expect(camera.targetYaw).toBe(0);
    expect(worldMovementToScreen(0, -1, camera.yaw)).toEqual({ x: 0, y: -1 });
    expect(worldMovementToScreen(1, 0, camera.yaw)).toEqual({ x: 1, y: 0 });
  });

  it('continues to transform screen-relative movement after user camera rotation', () => {
    expect(cameraRelativeMovement(0, -1, Math.PI / 2)).toEqual(expect.objectContaining({ x: -1 }));
    const projected = worldMovementToScreen(-1, 0, Math.PI / 2);
    expect(projected.y).toBeCloseTo(-1, 8);
  });

  it('normalizes diagonal input and treats equivalent wrapped angles identically', () => {
    const diagonal = cameraRelativeMovement(1, -1, Math.PI / 3);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 8);
    const beforeWrap = cameraRelativeMovement(0, -1, -0.0001);
    const afterWrap = cameraRelativeMovement(0, -1, Math.PI * 2 - 0.0001);
    expect(beforeWrap.x).toBeCloseTo(afterWrap.x, 8);
    expect(beforeWrap.y).toBeCloseTo(afterWrap.y, 8);
  });
});
