import type { FacingDirection } from '../facing';
import type { SpriteAnimationState } from './assetContract';

export type AnimationPlayback = { frameCount: number; fps: number; loop: boolean };

export class MotionAnimationState {
  value: 'idle' | 'walk' = 'idle';
  constructor(private readonly walkThreshold = 0.025, private readonly idleThreshold = 0.012) {}
  update(magnitude: number) {
    if (this.value === 'idle' && magnitude >= this.walkThreshold) this.value = 'walk';
    else if (this.value === 'walk' && magnitude <= this.idleThreshold) this.value = 'idle';
    return this.value;
  }
}

export class SpriteAnimator {
  state: SpriteAnimationState = 'idle';
  facing: FacingDirection = 's';
  frame = 0;
  elapsed = 0;
  restarts = 0;

  select(state: SpriteAnimationState, facing: FacingDirection) {
    if (state !== this.state) {
      this.state = state;
      this.frame = 0;
      this.elapsed = 0;
      this.restarts += 1;
    }
    this.facing = facing;
  }

  update(deltaSeconds: number, playback: AnimationPlayback) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || playback.frameCount <= 1) return this.frame;
    this.elapsed += deltaSeconds;
    // The epsilon prevents exact frame intervals such as 1/12 from landing just
    // below their integer boundary after repeated floating-point additions.
    const rawFrame = Math.floor(this.elapsed * playback.fps + 1e-9);
    this.frame = playback.loop ? rawFrame % playback.frameCount : Math.min(rawFrame, playback.frameCount - 1);
    return this.frame;
  }
}

export const effectsEnabledForQuality = (quality: 'full' | 'reduced' | 'minimum') => quality === 'full';

export const yawOnlyBillboardRotation = (cameraYaw: number) => ({ x: 0, y: cameraYaw, z: 0 });
