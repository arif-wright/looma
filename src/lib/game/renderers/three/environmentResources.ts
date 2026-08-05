import * as THREE from 'three';

type Disposable = { dispose: () => void };

export class SharedEnvironmentResources {
  private readonly values = new Map<string, Disposable>();

  acquire<T extends Disposable>(key: string, factory: () => T): T {
    const existing = this.values.get(key);
    if (existing) return existing as T;
    const resource = factory();
    this.values.set(key, resource);
    return resource;
  }

  get size() { return this.values.size; }

  dispose() {
    for (const resource of this.values.values()) resource.dispose();
    this.values.clear();
  }
}

export const prototypeMaterial = (color: string, emissive?: string) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(color), roughness: 0.95, transparent: true,
  ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.45 } : {})
});
