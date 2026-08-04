import { clampPitch, clampZoom, DEFAULT_CAMERA } from './math';

export class OrbitCameraState {
  yaw = DEFAULT_CAMERA.yaw;
  pitch = DEFAULT_CAMERA.pitch;
  zoom = DEFAULT_CAMERA.zoom;

  orbit(deltaYaw: number, deltaPitch: number) {
    this.yaw = (this.yaw + deltaYaw) % (Math.PI * 2);
    this.pitch = clampPitch(this.pitch + deltaPitch);
  }

  adjustZoom(delta: number) { this.zoom = clampZoom(this.zoom + delta); }

  reset() {
    this.yaw = DEFAULT_CAMERA.yaw;
    this.pitch = DEFAULT_CAMERA.pitch;
    this.zoom = DEFAULT_CAMERA.zoom;
  }
}
