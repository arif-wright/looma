import * as THREE from 'three';
import manifestJson from '../../environment/wilds-exploration.environment.json';
import {
  deterministicDecoration, environmentAnimationVariation, resolveEnvironmentAsset, validateEnvironmentManifest, visibleAtQuality,
  type EnvironmentAssetDefinition, type EnvironmentManifest, type EnvironmentQuality, type EnvironmentPropInstance
} from '../../environment/contract';
import { WORLD_TRAVERSAL } from '../../traversal';
import { SERVER_UNITS_PER_WORLD_UNIT, serverToWorld } from './math';
import type { ObstructableRegistration } from './obstruction';
import { SharedEnvironmentResources } from './environmentResources';

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
  instances: number;
  animatedInstances: number;
  visibleProps: number;
  decorativeProps: number;
  textureMemoryBytes: number;
  atlasPages: number;
  ambientEffects: number;
  sharedResources: number;
  animationUpdateMs: number;
  failedAssets: number;
};

export type EnvironmentWorld = {
  root: THREE.Group;
  obstructables: ObstructableRegistration[];
  metrics: EnvironmentMetrics;
  setQuality: (quality: EnvironmentQuality) => void;
  setMoonberryEmphasis: (active: boolean) => void;
  update: (elapsed: number, cameraPosition?: THREE.Vector3) => void;
  dispose: () => void;
};

type EnvironmentCard = {
  root: THREE.Group;
  card: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
  asset: EnvironmentAssetDefinition;
  instanceId: string;
  staticTexture: THREE.Texture;
  animatedMaterial?: THREE.ShaderMaterial;
};

const MAX_ACTIVE_ENVIRONMENT_ATLASES = 1;

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
uniform sampler2D atlas;
uniform vec4 atlasRegion;
uniform float opacity;
varying vec2 vUv;
void main() {
  vec2 atlasUv = atlasRegion.xy + vUv * atlasRegion.zw;
  vec4 color = texture2D(atlas, atlasUv);
  if (color.a < 0.025) discard;
  gl_FragColor = vec4(color.rgb, color.a * opacity);
}`;

const colorBytes = (color: string) => {
  const parsedColor = new THREE.Color(color);
  return new Uint8Array([Math.round(parsedColor.r * 255), Math.round(parsedColor.g * 255), Math.round(parsedColor.b * 255), 255]);
};

const createPathGeometry = (manifest: EnvironmentManifest, widthMultiplier = 1) => {
  const points = manifest.terrain.pathCenterline;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!;
    const after = points[Math.min(points.length - 1, index + 1)]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length * point.width * widthMultiplier / 2;
    const ny = dx / length * point.width * widthMultiplier / 2;
    for (const side of [-1, 1]) {
      const mapped = serverToWorld(point.x + nx * side, point.y + ny * side);
      vertices.push(mapped.x, widthMultiplier > 1 ? 0.018 : 0.026, mapped.z);
      uvs.push(index / Math.max(1, points.length - 1) * 3, side < 0 ? 0 : 1);
    }
    if (index > 0) {
      const base = index * 2;
      indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

export const environmentFrameAt = (asset: EnvironmentAssetDefinition, instanceId: string, elapsed: number, animate: boolean) => {
  const animation = asset.animation;
  if (!animation || !animate) return 0;
  const variation = environmentAnimationVariation(instanceId, animation.frameCount, animation.speedVariation ?? 0);
  const animationSeconds = animation.frameCount / animation.fps;
  const calm = animation.calmSeconds
    ? animation.calmSeconds[0] + (animation.calmSeconds[1] - animation.calmSeconds[0]) * ((variation.startFrame + 1) / animation.frameCount)
    : 0;
  const cycle = animationSeconds + calm;
  const time = (elapsed * variation.playbackRate + variation.phaseSeconds / animation.fps) % cycle;
  if (time >= animationSeconds) return 0;
  return Math.min(animation.frameCount - 1, Math.floor(time * animation.fps));
};

export const createEnvironmentWorld = (manifest: EnvironmentManifest = WILDS_ENVIRONMENT_MANIFEST!): EnvironmentWorld => {
  if (!manifest) throw new Error('No valid environment manifest is available.');
  const resources = new SharedEnvironmentResources();
  const root = new THREE.Group();
  root.name = `environment:${manifest.mapId}`;
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const qualityObjects: Array<{ object: THREE.Object3D; asset: EnvironmentAssetDefinition; decorative: boolean }> = [];
  const obstructables: ObstructableRegistration[] = [];
  const cards: EnvironmentCard[] = [];
  const textureUrls = new Set<string>();
  const assetFailures = new Set<string>();
  const animationTextures = new Map<string, THREE.Texture>();
  let quality: EnvironmentQuality = 'full';

  const assetFor = (id: string) => resolveEnvironmentAsset(manifest, id) ?? assets.get(id)!;
  const textureFor = (asset: EnvironmentAssetDefinition, url = asset.runtimeAsset ?? asset.texture) => {
    if (!url) return resources.acquire(`texture:fallback:${asset.id}`, () => {
      const texture = new THREE.DataTexture(colorBytes(asset.color ?? '#846ca8'), 1, 1);
      texture.needsUpdate = true;
      return texture;
    });
    textureUrls.add(url);
    return resources.acquire(`texture:${url}`, () => {
      const texture = new THREE.DataTexture(colorBytes(asset.color ?? '#846ca8'), 1, 1);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      if (typeof document === 'undefined') return texture;
      new THREE.TextureLoader().load(url, (loaded) => {
        texture.image = loaded.image;
        texture.wrapS = asset.renderer === 'surface' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = asset.renderer === 'surface' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = asset.renderer === 'surface';
        if (asset.renderer === 'surface') texture.repeat.set(3, 2);
        texture.needsUpdate = true;
      }, undefined, () => assetFailures.add(asset.id));
      return texture;
    });
  };
  const surfaceMaterial = (asset: EnvironmentAssetDefinition, opacity = 1) => resources.acquire(`material:surface:${asset.id}:${opacity}`, () => new THREE.MeshBasicMaterial({
    map: textureFor(asset), color: asset.color ?? '#ffffff', transparent: opacity < 1, opacity, depthWrite: opacity >= 1
  }));
  const animationTextureFor = (asset: EnvironmentAssetDefinition) => {
    const url = asset.animation?.sheet;
    if (!url) return null;
    const existing = animationTextures.get(asset.id);
    if (existing) return existing;
    const texture = new THREE.DataTexture(colorBytes(asset.color ?? '#846ca8'), 1, 1);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    if (typeof document !== 'undefined') new THREE.TextureLoader().load(url, (loaded) => {
      texture.image = loaded.image;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }, undefined, () => assetFailures.add(asset.id));
    animationTextures.set(asset.id, texture);
    return texture;
  };

  const terrainAsset = assetFor(manifest.terrain.surfaceAssetId);
  const terrainGeometry = resources.acquire('geometry:terrain', () => new THREE.PlaneGeometry(30, 16.875));
  const terrain = new THREE.Mesh(terrainGeometry, surfaceMaterial(terrainAsset));
  terrain.rotation.x = -Math.PI / 2;
  terrain.renderOrder = layerOrder.terrain;
  root.add(terrain);

  if (manifest.terrain.secondarySurfaceAssetId) {
    const detailAsset = assetFor(manifest.terrain.secondarySurfaceAssetId);
    const detail = new THREE.Mesh(terrainGeometry, surfaceMaterial(detailAsset, 0.16));
    detail.rotation.x = -Math.PI / 2;
    detail.rotation.z = Math.PI;
    detail.position.y = 0.008;
    detail.renderOrder = layerOrder['terrain-detail'];
    qualityObjects.push({ object: detail, asset: detailAsset, decorative: true });
    root.add(detail);
  }

  if (manifest.terrain.pathEdgeAssetId) {
    const edgeAsset = assetFor(manifest.terrain.pathEdgeAssetId);
    const edge = new THREE.Mesh(resources.acquire('geometry:path-edge', () => createPathGeometry(manifest, 1.22)), surfaceMaterial(edgeAsset));
    edge.renderOrder = layerOrder['terrain-detail'];
    qualityObjects.push({ object: edge, asset: edgeAsset, decorative: true });
    root.add(edge);
  }
  const pathAsset = assetFor(manifest.terrain.pathAssetId);
  const path = new THREE.Mesh(resources.acquire('geometry:path', () => createPathGeometry(manifest)), surfaceMaterial(pathAsset));
  path.renderOrder = layerOrder['terrain-detail'] + 1;
  root.add(path);

  const planeFor = (asset: EnvironmentAssetDefinition) => {
    const scale = asset.worldScale ?? { width: asset.width / SERVER_UNITS_PER_WORLD_UNIT, height: asset.height / SERVER_UNITS_PER_WORLD_UNIT };
    return resources.acquire(`geometry:card:${asset.id}`, () => new THREE.PlaneGeometry(scale.width, scale.height));
  };
  const shadowGeometry = resources.acquire('geometry:environment-shadow', () => new THREE.CircleGeometry(0.5, 20));
  const shadowMaterial = resources.acquire('material:environment-shadow', () => new THREE.MeshBasicMaterial({ color: 0x07130f, transparent: true, opacity: 0.2, depthWrite: false }));

  const createCard = (instance: EnvironmentPropInstance, decorative: boolean) => {
    const asset = assetFor(instance.assetId);
    const mapped = serverToWorld(instance.x, instance.y);
    const group = new THREE.Group();
    group.name = instance.id;
    group.position.set(mapped.x, 0, mapped.z);
    group.rotation.y = instance.rotation ?? 0;
    group.scale.setScalar(instance.scale ?? 1);
    group.renderOrder = layerOrder[asset.layer];
    const texture = textureFor(asset, asset.staticAsset ?? asset.runtimeAsset ?? asset.texture);
    let material: THREE.Material;
    let animatedMaterial: THREE.ShaderMaterial | undefined;
    if (asset.animation) {
      animatedMaterial = new THREE.ShaderMaterial({
        uniforms: { atlas: { value: texture }, atlasRegion: { value: new THREE.Vector4(0, 0, 1, 1) }, opacity: { value: 1 } },
        vertexShader, fragmentShader, transparent: true, depthWrite: false
      });
      material = animatedMaterial;
    } else {
      material = resources.acquire(`material:card:${asset.id}`, () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.025, depthWrite: false }));
    }
    const card = new THREE.Mesh(planeFor(asset), material);
    const height = asset.worldScale?.height ?? asset.height / SERVER_UNITS_PER_WORLD_UNIT;
    card.position.y = Math.max(0.01, (asset.pivot.y - 0.5) * height);
    card.onBeforeRender = () => {
      const opacity = Number(group.userData.environmentOpacity ?? 1);
      if (animatedMaterial) animatedMaterial.uniforms.opacity!.value = opacity;
      else {
        material.opacity = opacity;
        material.transparent = true;
      }
    };
    group.add(card);
    if (asset.shadow?.enabled) {
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(asset.shadow.width, asset.shadow.depth, 1);
      shadow.position.y = 0.012;
      group.add(shadow);
    }
    if (asset.obstruction && instance.collisionRef) {
      group.userData.obstructionId = instance.collisionRef;
      group.traverse((child) => { child.userData.obstructionId = instance.collisionRef; });
      obstructables.push({ id: instance.collisionRef, root: group, materials: [material], setOpacity: (opacity) => {
        group.userData.environmentOpacity = opacity;
        if (animatedMaterial) animatedMaterial.uniforms.opacity!.value = opacity;
      } });
    }
    cards.push({ root: group, card, asset, instanceId: instance.id, staticTexture: texture, ...(animatedMaterial ? { animatedMaterial } : {}) });
    qualityObjects.push({ object: group, asset, decorative });
    root.add(group);
    return group;
  };

  manifest.props.forEach((instance) => createCard(instance, false));
  for (const field of manifest.decorations) {
    const placements = deterministicDecoration(field).filter((placement) =>
      manifest.props.every((prop) => Math.hypot(prop.x - placement.x, prop.y - placement.y) >= field.exclusionRadius)
    );
    placements.forEach((placement) => createCard({ id: placement.id, assetId: placement.assetId, x: placement.x, y: placement.y, scale: placement.scale, rotation: placement.rotation }, true));
  }

  let moonberry: THREE.Group | null = null;
  manifest.interactables.forEach((instance) => { moonberry = createCard(instance, false); });

  const effectGroups: THREE.Points[] = [];
  for (const instance of manifest.effects) {
    const asset = assetFor(instance.assetId);
    const mapped = serverToWorld(instance.x, instance.y);
    const positions = new Float32Array(18 * 3);
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.399963;
      const radius = 0.3 + (index % 6) * 0.18;
      positions[index * 3] = mapped.x + Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.3 + (index % 6) * 0.24;
      positions[index * 3 + 2] = mapped.z + Math.sin(angle) * radius;
    }
    const geometry = resources.acquire(`geometry:effect:${asset.id}`, () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)));
    const material = resources.acquire(`material:effect:${asset.id}`, () => new THREE.PointsMaterial({ color: asset.color, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
    const points = new THREE.Points(geometry, material);
    points.renderOrder = layerOrder.effect;
    effectGroups.push(points);
    qualityObjects.push({ object: points, asset, decorative: true });
    root.add(points);
  }

  const metrics: EnvironmentMetrics = {
    drawCalls: 3 + cards.length + cards.filter((card) => card.asset.shadow?.enabled).length + effectGroups.length,
    instances: cards.length,
    animatedInstances: cards.filter((card) => Boolean(card.asset.animation)).length,
    visibleProps: cards.length,
    decorativeProps: qualityObjects.filter((item) => item.decorative).length,
    textureMemoryBytes: [...textureUrls].reduce((sum, url) => {
      const asset = manifest.assets.find((candidate) => candidate.runtimeAsset === url || candidate.staticAsset === url || candidate.texture === url);
      const derivedFrame = url.includes('-frame-00.png');
      return sum + (derivedFrame ? 256 * 256 * 4 : (asset?.width ?? 1) * (asset?.height ?? 1) * 4);
    }, 0),
    atlasPages: 0,
    ambientEffects: effectGroups.length,
    sharedResources: resources.size,
    animationUpdateMs: 0,
    failedAssets: 0
  };
  let emphasized = false;
  let disposed = false;
  return {
    root, obstructables, metrics,
    setQuality: (nextQuality) => {
      quality = nextQuality;
      qualityObjects.forEach(({ object, asset }) => { object.visible = visibleAtQuality(asset, nextQuality); });
      metrics.visibleProps = cards.filter((card) => card.root.visible).length;
    },
    setMoonberryEmphasis: (active) => { emphasized = active; },
    update: (elapsed, cameraPosition) => {
      const started = performance.now();
      const activeAnimationAssets = new Set<string>();
      if (quality === 'full' && cameraPosition) {
        const candidates = cards.filter((card) => card.root.visible && card.asset.animation)
          .map((card) => ({ card, distance: cameraPosition.distanceTo(card.root.position) }))
          .filter((entry) => entry.distance < 12)
          .sort((left, right) => left.distance - right.distance);
        for (const { card } of candidates) {
          activeAnimationAssets.add(card.asset.id);
          if (activeAnimationAssets.size >= MAX_ACTIVE_ENVIRONMENT_ATLASES) break;
        }
      }
      for (const [assetId, texture] of animationTextures) if (!activeAnimationAssets.has(assetId)) {
        texture.dispose();
        animationTextures.delete(assetId);
      }
      for (const card of cards) {
        if (!card.root.visible) continue;
        if (cameraPosition) card.card.rotation.y = Math.atan2(cameraPosition.x - card.root.position.x, cameraPosition.z - card.root.position.z) - card.root.rotation.y;
        const animation = card.asset.animation;
        if (animation && card.animatedMaterial) {
          const animate = activeAnimationAssets.has(card.asset.id);
          const frame = environmentFrameAt(card.asset, card.instanceId, elapsed, animate);
          card.animatedMaterial.uniforms.atlas!.value = animate ? animationTextureFor(card.asset) ?? card.staticTexture : card.staticTexture;
          if (!animate) {
            card.animatedMaterial.uniforms.atlasRegion!.value.set(0, 0, 1, 1);
            continue;
          }
          const column = frame % animation.columns;
          const row = Math.floor(frame / animation.columns);
          const columns = animation.columns;
          const rows = Math.ceil(animation.frameCount / columns);
          card.animatedMaterial.uniforms.atlasRegion!.value.set(column / columns, 1 - (row + 1) / rows, 1 / columns, 1 / rows);
        }
      }
      if (moonberry) {
        const scale = emphasized ? 1.08 + Math.sin(elapsed * 5) * 0.035 : 1 + Math.sin(elapsed * 2) * 0.012;
        moonberry.scale.setScalar(scale);
      }
      effectGroups.forEach((effect, index) => { effect.rotation.y = elapsed * (0.05 + index * 0.01); });
      metrics.animationUpdateMs = performance.now() - started;
      metrics.failedAssets = assetFailures.size;
      metrics.atlasPages = animationTextures.size;
      const staticBytes = [...textureUrls].reduce((sum, url) => {
        const asset = manifest.assets.find((candidate) => candidate.runtimeAsset === url || candidate.staticAsset === url || candidate.texture === url);
        return sum + (url.includes('-frame-00.png') ? 256 * 256 * 4 : (asset?.width ?? 1) * (asset?.height ?? 1) * 4);
      }, 0);
      metrics.textureMemoryBytes = staticBytes + animationTextures.size * 1280 * 1280 * 4;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cards.forEach((card) => card.animatedMaterial?.dispose());
      animationTextures.forEach((texture) => texture.dispose());
      animationTextures.clear();
      root.clear();
      resources.dispose();
    }
  };
};
