import type * as THREE from 'three';

export type ObstructionOpacity = { id: string; opacity: number };

export type ObstructableRegistration = {
  id: string;
  root: THREE.Object3D;
  materials: THREE.Material[];
};

export class ObstructionFadeController {
  private readonly opacity = new Map<string, number>();

  update(ids: readonly string[], obstructed: ReadonlySet<string>, deltaSeconds: number): ObstructionOpacity[] {
    const alpha = 1 - Math.exp(-8 * Math.max(0, deltaSeconds));
    return ids.map((id) => {
      const current = this.opacity.get(id) ?? 1;
      const target = obstructed.has(id) ? 0.28 : 1;
      const opacity = current + (target - current) * alpha;
      this.opacity.set(id, opacity);
      return { id, opacity };
    });
  }
}
