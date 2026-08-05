import * as THREE from 'three';
import manifestJson from '../../environment/wilds-exploration.environment.json';
import {
  deterministicDecoration, resolveEnvironmentAsset, validateEnvironmentManifest, visibleAtQuality,
  type EnvironmentAssetDefinition, type EnvironmentManifest, type EnvironmentQuality
} from '../../environment/contract';
import { WORLD_TRAVERSAL } from '../../traversal';
import { SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';
import type { ObstructableRegistration } from './obstruction';
import { prototypeMaterial, SharedEnvironmentResources } from './environmentResources';

const collisionIds = new Set(WORLD_TRAVERSAL.blockers.map((blocker) => blocker.id));
const parsed = validateEnvironmentManifest(manifestJson, collisionIds);
if (!parsed.ok) console.error('[world:environment] Bundled environment manifest is invalid.', parsed.errors);
export const WILDS_ENVIRONMENT_MANIFEST = parsed.manifest ?? null;

const layerOrder = {
  terrain: -100, 'terrain-detail': -90, 'low-vegetation': -50, prop: -10,
  actor: 0, companion: 1, foreground: 10, effect: 20, label: 100
} as const;

export type EnvironmentMetrics = {
  drawCalls: number;
  visibleProps: number;
  decorativeProps: number;
  textureMemoryBytes: number;
  ambientEffects: number;
  sharedResources: number;
};

export type EnvironmentWorld = {
  root: THREE.Group;
  obstructables: ObstructableRegistration[];
  metrics: EnvironmentMetrics;
  setQuality: (quality: EnvironmentQuality) => void;
  setMoonberryEmphasis: (active: boolean) => void;
  update: (elapsed: number) => void;
  dispose: () => void;
};

const materialKey = (asset: EnvironmentAssetDefinition) => `material:${asset.id}`;
const createPathGeometry = (manifest: EnvironmentManifest) => {
  const points = manifest.terrain.pathCenterline;
  const vertices: number[] = [];
  const indices: number[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!;
    const after = points[Math.min(points.length - 1, index + 1)]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * point.width / 2;
    const ny = dx / length * point.width / 2;
    for (const side of [-1, 1]) {
      const mapped = serverToWorld(point.x + nx * side, point.y + ny * side);
      vertices.push(mapped.x, 0.025, mapped.z);
    }
    if (index > 0) {
      const base = index * 2;
      indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const configureObstructionMesh = (mesh: THREE.Mesh, root: THREE.Object3D, material: THREE.Material) => {
  mesh.onBeforeRender = () => {
    const opacity = Number(root.userData.environmentOpacity ?? 1);
    material.opacity = opacity;
    material.transparent = true;
    material.depthWrite = opacity > 0.75;
  };
};

export const createEnvironmentWorld = (manifest: EnvironmentManifest = WILDS_ENVIRONMENT_MANIFEST!): EnvironmentWorld => {
  if (!manifest) throw new Error('No valid environment manifest is available.');
  const resources = new SharedEnvironmentResources();
  const root = new THREE.Group();
  root.name = `environment:${manifest.mapId}`;
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const qualityObjects: Array<{ object: THREE.Object3D; asset: EnvironmentAssetDefinition; decorative: boolean }> = [];
  const obstructables: ObstructableRegistration[] = [];

  const assetFor = (id: string) => resolveEnvironmentAsset(manifest, id) ?? assets.get(id)!;
  const textureLoader = new THREE.TextureLoader();
  const textureFor = (asset: EnvironmentAssetDefinition) => asset.texture
    ? resources.acquire(`texture:${asset.texture}`, () => {
      const texture = textureLoader.load(asset.texture!);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (asset.renderer === 'surface') {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      }
      return texture;
    })
    : undefined;
  const materialFor = (asset: EnvironmentAssetDefinition) => resources.acquire(materialKey(asset), () => {
    const material = prototypeMaterial(asset.color ?? '#ffffff', asset.glow?.color);
    material.map = textureFor(asset) ?? null;
    material.needsUpdate = true;
    return material;
  });
  const terrainAsset = assetFor(manifest.terrain.surfaceAssetId);
  const terrainGeometry = resources.acquire('geometry:terrain', () => new THREE.PlaneGeometry(30, 16.875));
  const terrain = new THREE.Mesh(terrainGeometry, materialFor(terrainAsset));
  terrain.rotation.x = -Math.PI / 2;
  terrain.renderOrder = layerOrder.terrain;
  root.add(terrain);

  const pathAsset = assetFor(manifest.terrain.pathAssetId);
  const path = new THREE.Mesh(resources.acquire('geometry:path', () => createPathGeometry(manifest)), materialFor(pathAsset));
  path.renderOrder = layerOrder['terrain-detail'];
  root.add(path);

  const treeTrunk = resources.acquire('geometry:tree-trunk', () => new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8));
  const treeCrown = resources.acquire('geometry:tree-crown', () => new THREE.ConeGeometry(1.05, 2.6, 10));
  const trunkMaterial = resources.acquire('material:tree-trunk', () => prototypeMaterial('#624a35'));
  const rockGeometry = resources.acquire('geometry:rock', () => new THREE.DodecahedronGeometry(1, 0));

  for (const instance of manifest.props) {
    const asset = assetFor(instance.assetId);
    const mapped = serverToWorld(instance.x, instance.y);
    const prop = new THREE.Group();
    prop.name = instance.id;
    prop.position.set(mapped.x, 0, mapped.z);
    prop.rotation.y = instance.rotation ?? 0;
    prop.scale.setScalar(instance.scale ?? 1);
    prop.renderOrder = layerOrder[asset.layer];
    const materials: THREE.Material[] = [];
    if (asset.renderer === 'billboard') {
      const width = asset.width / SERVER_UNITS_PER_WORLD_UNIT;
      const height = asset.height / SERVER_UNITS_PER_WORLD_UNIT;
      const geometry = resources.acquire(`geometry:billboard:${asset.id}`, () => new THREE.PlaneGeometry(width, height));
      const material = materialFor(asset);
      const card = new THREE.Mesh(geometry, material);
      card.position.set((0.5 - asset.pivot.x) * width, (1 - asset.pivot.y) * height + height / 2, 0);
      card.onBeforeRender = (_renderer, _scene, camera) => {
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        card.rotation.y = Math.atan2(cameraPosition.x - prop.position.x, cameraPosition.z - prop.position.z);
        const opacity = Number(prop.userData.environmentOpacity ?? 1);
        material.opacity = opacity;
        material.transparent = true;
        material.depthWrite = opacity > 0.75;
      };
      prop.add(card);
      materials.push(material);
    } else if (instance.assetId.includes('tree')) {
      const trunk = new THREE.Mesh(treeTrunk, trunkMaterial);
      trunk.position.y = 0.8;
      const crownMaterial = materialFor(asset);
      const crown = new THREE.Mesh(treeCrown, crownMaterial);
      crown.position.y = 2.35;
      configureObstructionMesh(trunk, prop, trunkMaterial);
      configureObstructionMesh(crown, prop, crownMaterial);
      prop.add(trunk, crown);
      materials.push(trunkMaterial, crownMaterial);
    } else {
      const material = materialFor(asset);
      const scale = (asset.width / SERVER_UNITS_PER_WORLD_UNIT) / 2;
      const mesh = new THREE.Mesh(rockGeometry, material);
      mesh.scale.set(scale, scale * 0.65, scale);
      mesh.position.y = scale * 0.42;
      configureObstructionMesh(mesh, prop, material);
      prop.add(mesh);
      materials.push(material);
    }
    if (asset.obstruction && instance.collisionRef) {
      prop.userData.obstructionId = instance.collisionRef;
      prop.traverse((child) => { child.userData.obstructionId = instance.collisionRef; });
      obstructables.push({ id: instance.collisionRef, root: prop, materials, setOpacity: (opacity) => { prop.userData.environmentOpacity = opacity; } });
    }
    qualityObjects.push({ object: prop, asset, decorative: false });
    root.add(prop);
  }

  const decorationMeshes: THREE.InstancedMesh[] = [];
  for (const field of manifest.decorations) {
    const placements = deterministicDecoration(field).filter((placement) =>
      manifest.props.every((prop) => Math.hypot(prop.x - placement.x, prop.y - placement.y) >= field.exclusionRadius)
    );
    for (const assetId of field.assetIds) {
      const asset = assetFor(assetId);
      const selected = placements.filter((placement) => placement.assetId === assetId);
      const geometry = resources.acquire(`geometry:decoration:${assetId}`, () => new THREE.ConeGeometry(0.09, assetId.includes('flower') ? 0.18 : 0.3, 5));
      const mesh = new THREE.InstancedMesh(geometry, materialFor(asset), selected.length);
      const matrix = new THREE.Matrix4();
      selected.forEach((placement, index) => {
        const mapped = serverToWorld(placement.x, placement.y);
        matrix.compose(new THREE.Vector3(mapped.x, 0.1, mapped.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotation), new THREE.Vector3(placement.scale, placement.scale, placement.scale));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = layerOrder[asset.layer];
      decorationMeshes.push(mesh);
      qualityObjects.push({ object: mesh, asset, decorative: true });
      root.add(mesh);
    }
  }

  let moonberry: THREE.Mesh | null = null;
  for (const instance of manifest.interactables) {
    const asset = assetFor(instance.assetId);
    const geometry = resources.acquire('geometry:moonberry', () => new THREE.CylinderGeometry(0.75, 0.9, 0.25, 24));
    moonberry = new THREE.Mesh(geometry, materialFor(asset));
    const mapped = serverToWorld(instance.x, instance.y);
    moonberry.position.set(mapped.x, 0.14, mapped.z);
    moonberry.renderOrder = layerOrder[asset.layer];
    qualityObjects.push({ object: moonberry, asset, decorative: false });
    root.add(moonberry);
  }

  const effectGroups: THREE.Points[] = [];
  for (const instance of manifest.effects) {
    const asset = assetFor(instance.assetId);
    const mapped = serverToWorld(instance.x, instance.y);
    const positions = new Float32Array(24 * 3);
    for (let index = 0; index < 24; index += 1) {
      const angle = index * 2.399963;
      const radius = 0.3 + (index % 8) * 0.16;
      positions[index * 3] = mapped.x + Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.3 + (index % 6) * 0.24;
      positions[index * 3 + 2] = mapped.z + Math.sin(angle) * radius;
    }
    const geometry = resources.acquire(`geometry:effect:${asset.id}`, () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)));
    const material = resources.acquire(`material:effect:${asset.id}`, () => new THREE.PointsMaterial({ color: asset.color, size: 0.055, transparent: true, opacity: 0.55, depthWrite: false }));
    const points = new THREE.Points(geometry, material);
    points.renderOrder = layerOrder.effect;
    effectGroups.push(points);
    qualityObjects.push({ object: points, asset, decorative: true });
    root.add(points);
  }

  const metrics: EnvironmentMetrics = {
    drawCalls: 2 + manifest.props.reduce((sum, prop) => sum + (prop.assetId.includes('tree') ? 2 : 1), 0) + decorationMeshes.length + manifest.interactables.length + effectGroups.length,
    visibleProps: manifest.props.length + manifest.interactables.length,
    decorativeProps: decorationMeshes.reduce((sum, mesh) => sum + mesh.count, 0),
    textureMemoryBytes: manifest.assets.filter((asset) => Boolean(asset.texture)).reduce((sum, asset) => sum + asset.width * asset.height * 4, 0),
    ambientEffects: effectGroups.length,
    sharedResources: resources.size
  };
  let emphasized = false;
  let disposed = false;
  return {
    root, obstructables, metrics,
    setQuality: (quality) => { qualityObjects.forEach(({ object, asset }) => { object.visible = visibleAtQuality(asset, quality); }); },
    setMoonberryEmphasis: (active) => { emphasized = active; },
    update: (elapsed) => {
      if (moonberry) {
        const scale = emphasized ? 1.08 + Math.sin(elapsed * 5) * 0.035 : 1 + Math.sin(elapsed * 2) * 0.018;
        moonberry.scale.setScalar(scale);
      }
      effectGroups.forEach((effect, index) => { effect.rotation.y = elapsed * (0.05 + index * 0.01); });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.clear();
      resources.dispose();
    }
  };
};
