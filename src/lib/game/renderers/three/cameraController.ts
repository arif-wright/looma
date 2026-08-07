import { clampPitch, clampZoom, DEFAULT_CAMERA, lerpAngle } from './math';

export type CameraPresetName = 'classic' | 'adventurer' | 'wide' | 'close';
export type CameraPreset = {
  yaw: number;
  pitch: number;
  zoom: number;
  followSmoothing: number;
  orbitSensitivity: number;
  pitchSensitivity: number;
};

const degrees = (value: number) => value * Math.PI / 180;

export const CAMERA_PRESETS: Record<CameraPresetName, CameraPreset> = {
  classic: { yaw: DEFAULT_CAMERA.yaw, pitch: degrees(45), zoom: 1, followSmoothing: 8, orbitSensitivity: 0.007, pitchSensitivity: 0.005 },
  adventurer: { yaw: DEFAULT_CAMERA.yaw, pitch: degrees(38), zoom: 1.18, followSmoothing: 10, orbitSensitivity: 0.0065, pitchSensitivity: 0.0045 },
  wide: { yaw: DEFAULT_CAMERA.yaw, pitch: degrees(55), zoom: 0.78, followSmoothing: 6, orbitSensitivity: 0.008, pitchSensitivity: 0.0055 },
  close: { yaw: DEFAULT_CAMERA.yaw, pitch: degrees(42), zoom: 1.5, followSmoothing: 11, orbitSensitivity: 0.006, pitchSensitivity: 0.004 }
};

export const isCameraPreset = (value: unknown): value is CameraPresetName =>
  typeof value === 'string' && value in CAMERA_PRESETS;

export const parseCameraReviewState = (params: URLSearchParams) => {
  const degreesValue = (key: string) => {
    const value = Number(params.get(key));
    return Number.isFinite(value) && params.has(key) ? degrees(value) : null;
  };
  const zoom = Number(params.get('worldCameraZoom'));
  return {
    yaw: degreesValue('worldCameraYaw'),
    pitch: degreesValue('worldCameraPitch'),
    zoom: Number.isFinite(zoom) && params.has('worldCameraZoom') ? zoom : null
  };
};

export class OrbitCameraState {
  preset: CameraPresetName;
  yaw: number;
  pitch: number;
  zoom: number;
  targetYaw: number;
  targetPitch: number;
  targetZoom: number;

  constructor(preset: CameraPresetName = 'classic') {
    this.preset = preset;
    this.yaw = CAMERA_PRESETS[preset].yaw;
    this.targetYaw = this.yaw;
    this.pitch = CAMERA_PRESETS[preset].pitch;
    this.zoom = CAMERA_PRESETS[preset].zoom;
    this.targetPitch = this.pitch;
    this.targetZoom = this.zoom;
  }

  get settings() { return CAMERA_PRESETS[this.preset]; }

  orbitPixels(deltaX: number, deltaY: number) {
    this.orbit(-deltaX * this.settings.orbitSensitivity, deltaY * this.settings.pitchSensitivity);
  }

  orbit(deltaYaw: number, deltaPitch: number) {
    this.targetYaw += deltaYaw;
    this.targetPitch = clampPitch(this.targetPitch + deltaPitch);
  }

  adjustZoom(delta: number) { this.targetZoom = clampZoom(this.targetZoom + delta); }

  selectPreset(preset: CameraPresetName) {
    this.preset = preset;
    this.targetYaw = CAMERA_PRESETS[preset].yaw;
    this.targetPitch = CAMERA_PRESETS[preset].pitch;
    this.targetZoom = CAMERA_PRESETS[preset].zoom;
  }

  reset() {
    this.targetYaw = CAMERA_PRESETS[this.preset].yaw;
    this.targetPitch = CAMERA_PRESETS[this.preset].pitch;
    this.targetZoom = CAMERA_PRESETS[this.preset].zoom;
  }

  applyReviewState(review: ReturnType<typeof parseCameraReviewState>) {
    if (review.yaw !== null) this.yaw = this.targetYaw = review.yaw;
    if (review.pitch !== null) this.pitch = this.targetPitch = clampPitch(review.pitch);
    if (review.zoom !== null) this.zoom = this.targetZoom = clampZoom(review.zoom);
  }

  update(deltaSeconds: number) {
    const alpha = 1 - Math.exp(-10 * Math.max(0, deltaSeconds));
    this.yaw = lerpAngle(this.yaw, this.targetYaw, alpha);
    this.pitch += (this.targetPitch - this.pitch) * alpha;
    this.zoom += (this.targetZoom - this.zoom) * alpha;
  }
}
