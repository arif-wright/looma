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
import {
  cameraRelativeEnvironmentAngle, cylindricalBillboardYaw, horizontalEnvironmentDistance,
  resolveEnvironmentDirection, resolveEnvironmentLod, resolveEnvironmentRenderClass,
  type EnvironmentDirection, type EnvironmentLod, type EnvironmentRenderClass
} from '../../environment/presentation';

const collisionIds = new Set(WORLD_TRAVERSAL.blockers.map((blocker) => blocker.id));
const parsed = validateEnvironmentManifest(manifestJson, collisionIds);
if (!parsed.ok) console.error('[world:environment] Bundled environment manifest is invalid.', parsed.errors);
export const WILDS_ENVIRONMENT_MANIFEST = parsed.manifest ?? null;

export const createBroadleafReviewManifest = (manifest: EnvironmentManifest): EnvironmentManifest => ({
  ...structuredClone(manifest),
  props: [
    { id: 'broadleaf-v2-review-a', assetId: 'tree.broadleaf', x: 360, y: 210 },
    { id: 'broadleaf-v2-review-b', assetId: 'tree.broadleaf', x: 520, y: 330 }
  ],
  decorations: [], interactables: [], effects: []
});

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

export type EnvironmentTextureDiagnostic = {
  assetId: string;
  url: string;
  status: 'loading' | 'loaded' | 'error' | 'server-fallback';
  width: number;
  height: number;
  colorSpace: string;
  error: string | null;
};

export type EnvironmentObjectDiagnostic = {
  assetId: string;
  assetVersion: number;
  instanceId: string;
  renderClass: EnvironmentRenderClass;
  provenance: string;
  runtimeTextureUrl: string | null;
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  renderOrder: number;
  animated: boolean;
  selectedDirection: EnvironmentDirection | null;
  cameraRelativeAngleDegrees: number | null;
  animationFrame: number;
  animationFrames: number;
  fps: number;
  animationPhase: number;
  instancePhaseOffset: number;
  groundAnchor: { x: number; y: number };
  collisionFootprint: string | null;
  lod: EnvironmentLod;
  textureMemoryBytes: number;
  texturePage: string | null;
  loadStatus: EnvironmentTextureDiagnostic['status'] | 'unknown';
};

export type EnvironmentWorld = {
  root: THREE.Group;
  obstructables: ObstructableRegistration[];
  metrics: EnvironmentMetrics;
  diagnostics: () => {
    terrain: { assetId: string; textureUrl: string | null; material: string; color: string; opacity: number; transparent: boolean; depthWrite: boolean; depthTest: boolean; renderOrder: number };
    textures: EnvironmentTextureDiagnostic[];
    objects: EnvironmentObjectDiagnostic[];
  };
  setQuality: (quality: EnvironmentQuality) => void;
  setMoonberryEmphasis: (active: boolean) => void;
  update: (elapsed: number, cameraPosition?: THREE.Vector3) => void;
  dispose: () => void;
};

export type EnvironmentDebugOverrides = {
  broadleafDirection?: EnvironmentDirection;
  broadleafFps?: number;
  broadleafFrame?: number;
  broadleafLod?: EnvironmentLod;
};

type EnvironmentCard = {
  root: THREE.Group;
  card: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;
  asset: EnvironmentAssetDefinition;
  instanceId: string;
  staticTexture: THREE.Texture;
  animatedMaterial?: THREE.ShaderMaterial;
  renderClass: EnvironmentRenderClass;
  authoredYaw: number;
  selectedDirection: EnvironmentDirection | null;
  cameraRelativeAngle: number | null;
  animationFrame: number;
  lod: EnvironmentLod;
  normalizedPhase: number;
  instancePhaseOffset: number;
  texturePage: string | null;
};

const MAX_ACTIVE_ENVIRONMENT_ATLASES = 2;
export const ENVIRONMENT_DIAGNOSTIC_STAGES = [
  'background', 'grass', 'path', 'transition', 'broadleaf', 'evergreen', 'large-rock', 'medium-rock',
  'grass-tuft', 'flower-cluster', 'aether-plant', 'moonberry', 'animation', 'effects', 'full'
] as const;
export type EnvironmentDiagnosticStage = (typeof ENVIRONMENT_DIAGNOSTIC_STAGES)[number];
export const parseEnvironmentDiagnosticStage = (value: string | null): EnvironmentDiagnosticStage =>
  ENVIRONMENT_DIAGNOSTIC_STAGES.includes(value as EnvironmentDiagnosticStage) ? value as EnvironmentDiagnosticStage : 'full';
const stageRank = (stage: EnvironmentDiagnosticStage) => ENVIRONMENT_DIAGNOSTIC_STAGES.indexOf(stage);
const assetStage = (assetId: string): EnvironmentDiagnosticStage => {
  if (assetId === 'tree.broadleaf') return 'broadleaf';
  if (assetId === 'tree.evergreen') return 'evergreen';
  if (assetId === 'rock.large') return 'large-rock';
  if (assetId === 'rock.medium') return 'medium-rock';
  if (assetId === 'vegetation.grass-tuft') return 'grass-tuft';
  if (assetId === 'vegetation.flower-cluster') return 'flower-cluster';
  if (assetId === 'magical.aether-plant') return 'aether-plant';
  if (assetId === 'interactable.moonberry') return 'moonberry';
  return 'full';
};

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

const diagnosticFallbackCanvas = (label: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.fillStyle = '#ff00d4';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#111111';
  context.fillRect(0, 0, 32, 32);
  context.fillRect(32, 32, 32, 32);
  context.fillStyle = '#ffffff';
  context.font = 'bold 9px sans-serif';
  context.fillText(label.slice(0, 8), 3, 61);
  return canvas;
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
  return Math.min(animation.frameCount - 1, Math.floor(environmentNormalizedPhaseAt(asset, instanceId, elapsed, animate) * animation.frameCount));
};

export const environmentNormalizedPhaseAt = (asset: EnvironmentAssetDefinition, instanceId: string, elapsed: number, animate: boolean) => {
  const animation = asset.animation;
  if (!animation || !animate) return 0;
  const variation = environmentAnimationVariation(instanceId, animation.frameCount, animation.speedVariation ?? 0);
  const animationSeconds = animation.frameCount / animation.fps;
  const calm = animation.calmSeconds
    ? animation.calmSeconds[0] + (animation.calmSeconds[1] - animation.calmSeconds[0]) * ((variation.startFrame + 1) / animation.frameCount)
    : 0;
  const cycle = animationSeconds + calm;
  const phaseOffsetSeconds = variation.startFrame / animation.frameCount * animationSeconds;
  const time = (elapsed * variation.playbackRate + phaseOffsetSeconds) % cycle;
  if (time >= animationSeconds) return 0;
  return Math.min(0.999999, time / animationSeconds);
};

export const environmentFrameForPhase = (normalizedPhase: number, frameCount: number) =>
  Math.min(frameCount - 1, Math.max(0, Math.floor(normalizedPhase * frameCount)));

export const environmentAtlasRegionForFrame = (frame: number, frameCount: number, columns: number) => {
  const safeFrame = Math.min(frameCount - 1, Math.max(0, frame));
  const rows = Math.ceil(frameCount / columns);
  return {
    x: (safeFrame % columns) / columns,
    y: 1 - (Math.floor(safeFrame / columns) + 1) / rows,
    width: 1 / columns,
    height: 1 / rows
  };
};

export const createEnvironmentWorld = (
  manifest: EnvironmentManifest = WILDS_ENVIRONMENT_MANIFEST!,
  diagnosticStage: EnvironmentDiagnosticStage = 'full',
  debugOverrides: EnvironmentDebugOverrides = {}
): EnvironmentWorld => {
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
  const textureDiagnostics = new Map<string, EnvironmentTextureDiagnostic>();
  const animationTextures = new Map<string, THREE.Texture>();
  let quality: EnvironmentQuality = 'full';

  const configureTexture = (texture: THREE.Texture, surface: boolean) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = surface ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = surface ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.minFilter = surface ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = surface;
    texture.anisotropy = surface ? 4 : 1;
    if (surface) texture.repeat.set(3, 2);
    texture.needsUpdate = true;
  };
  const loadTexture = (asset: EnvironmentAssetDefinition, url: string) => {
    const diagnostic: EnvironmentTextureDiagnostic = {
      assetId: asset.id, url, status: typeof document === 'undefined' ? 'server-fallback' : 'loading',
      width: 0, height: 0, colorSpace: THREE.SRGBColorSpace, error: null
    };
    textureDiagnostics.set(url, diagnostic);
    if (typeof document === 'undefined') {
      const fallback = new THREE.DataTexture(colorBytes(asset.color ?? '#846ca8'), 1, 1);
      configureTexture(fallback, asset.renderer === 'surface');
      return fallback;
    }
    const texture = new THREE.TextureLoader().load(url, (loaded) => {
      configureTexture(loaded, asset.renderer === 'surface');
      const image = loaded.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      diagnostic.status = 'loaded';
      diagnostic.width = image.naturalWidth ?? image.width ?? 0;
      diagnostic.height = image.naturalHeight ?? image.height ?? 0;
    }, undefined, (error) => {
      assetFailures.add(asset.id);
      diagnostic.status = 'error';
      diagnostic.error = error instanceof Error ? error.message : `Texture request failed: ${url}`;
      texture.image = diagnosticFallbackCanvas(import.meta.env.DEV ? 'ERROR' : 'ENV');
      configureTexture(texture, asset.renderer === 'surface');
      if (import.meta.env.DEV) console.error('[world:environment] Production texture failed to load.', { assetId: asset.id, url, error: diagnostic.error });
    });
    configureTexture(texture, asset.renderer === 'surface');
    return texture;
  };

  const assetFor = (id: string) => resolveEnvironmentAsset(manifest, id) ?? assets.get(id)!;
  const textureFor = (asset: EnvironmentAssetDefinition, url = asset.runtimeAsset ?? asset.texture) => {
    if (!url) return resources.acquire(`texture:fallback:${asset.id}`, () => {
      const texture = new THREE.DataTexture(colorBytes(asset.color ?? '#846ca8'), 1, 1);
      texture.needsUpdate = true;
      return texture;
    });
    textureUrls.add(url);
    return resources.acquire(`texture:${url}`, () => {
      return loadTexture(asset, url);
    });
  };
  const surfaceMaterial = (asset: EnvironmentAssetDefinition, opacity = 1) => resources.acquire(`material:surface:${asset.id}:${opacity}`, () => new THREE.MeshBasicMaterial({
    map: textureFor(asset), color: asset.color ?? '#ffffff', transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    depthTest: true, side: THREE.DoubleSide
  }));
  const directionalAnimation = (asset: EnvironmentAssetDefinition, direction: EnvironmentDirection | null) =>
    direction ? asset.animation?.directions?.[direction] : undefined;
  const animationTextureFor = (asset: EnvironmentAssetDefinition, direction: EnvironmentDirection | null) => {
    const url = directionalAnimation(asset, direction)?.sheet ?? asset.animation?.sheet;
    if (!url) return null;
    const key = `${asset.id}:${direction ?? 'default'}`;
    const existing = animationTextures.get(key);
    if (existing) return existing;
    const texture = loadTexture(asset, url);
    animationTextures.set(key, texture);
    return texture;
  };

  const terrainAsset = assetFor(manifest.terrain.surfaceAssetId);
  const terrainGeometry = resources.acquire('geometry:terrain', () => new THREE.PlaneGeometry(30, 16.875));
  const terrain = new THREE.Mesh(terrainGeometry, surfaceMaterial(terrainAsset));
  terrain.rotation.x = -Math.PI / 2;
  terrain.renderOrder = layerOrder.terrain;
  if (stageRank(diagnosticStage) >= stageRank('grass')) root.add(terrain);

  if (manifest.terrain.secondarySurfaceAssetId && stageRank(diagnosticStage) >= stageRank('transition')) {
    const detailAsset = assetFor(manifest.terrain.secondarySurfaceAssetId);
    const detail = new THREE.Mesh(terrainGeometry, surfaceMaterial(detailAsset, 0.16));
    detail.rotation.x = -Math.PI / 2;
    detail.rotation.z = Math.PI;
    detail.position.y = 0.008;
    detail.renderOrder = layerOrder['terrain-detail'];
    qualityObjects.push({ object: detail, asset: detailAsset, decorative: true });
    root.add(detail);
  }

  if (manifest.terrain.pathEdgeAssetId && stageRank(diagnosticStage) >= stageRank('transition')) {
    const edgeAsset = assetFor(manifest.terrain.pathEdgeAssetId);
    const edge = new THREE.Mesh(resources.acquire('geometry:path-edge', () => createPathGeometry(manifest, 1.22)), surfaceMaterial(edgeAsset));
    edge.renderOrder = layerOrder['terrain-detail'];
    qualityObjects.push({ object: edge, asset: edgeAsset, decorative: true });
    root.add(edge);
  }
  const pathAsset = assetFor(manifest.terrain.pathAssetId);
  const path = new THREE.Mesh(resources.acquire('geometry:path', () => createPathGeometry(manifest)), surfaceMaterial(pathAsset));
  path.renderOrder = layerOrder['terrain-detail'] + 1;
  if (stageRank(diagnosticStage) >= stageRank('path')) root.add(path);

  const planeFor = (asset: EnvironmentAssetDefinition) => {
    const scale = asset.worldScale ?? { width: asset.width / SERVER_UNITS_PER_WORLD_UNIT, height: asset.height / SERVER_UNITS_PER_WORLD_UNIT };
    return resources.acquire(`geometry:card:${asset.id}`, () => new THREE.PlaneGeometry(scale.width, scale.height));
  };
  const shadowGeometry = resources.acquire('geometry:environment-shadow', () => new THREE.CircleGeometry(0.5, 20));
  const shadowMaterial = resources.acquire('material:environment-shadow', () => new THREE.MeshBasicMaterial({ color: 0x07130f, transparent: true, opacity: 0.2, depthWrite: false }));

  const createCard = (instance: EnvironmentPropInstance, decorative: boolean) => {
    const asset = assetFor(instance.assetId);
    const renderClass = resolveEnvironmentRenderClass(asset);
    if (stageRank(diagnosticStage) < stageRank(assetStage(asset.id))) return null;
    const mapped = serverToWorld(instance.x, instance.y);
    const group = new THREE.Group();
    group.name = instance.id;
    group.position.set(mapped.x, 0, mapped.z);
    const authoredYaw = instance.rotation ?? 0;
    // Upright presentation cards own their camera-facing yaw. Only ground-aligned
    // props apply authored rotation to the root transform.
    group.rotation.y = renderClass === 'ground-prop' || renderClass === 'ground-detail' ? authoredYaw : 0;
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
    const groundAnchor = asset.groundAnchor ?? asset.pivot;
    if (renderClass === 'ground-prop' || renderClass === 'ground-detail') {
      card.rotation.x = -Math.PI / 2;
      card.position.y = 0.018;
    } else card.position.y = Math.max(0.01, (groundAnchor.y - 0.5) * height);
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
    cards.push({
      root: group, card, asset, instanceId: instance.id, staticTexture: texture, renderClass, authoredYaw,
      selectedDirection: null, cameraRelativeAngle: null, animationFrame: 0, lod: 'near',
      normalizedPhase: 0,
      instancePhaseOffset: environmentAnimationVariation(instance.id, asset.animation?.frameCount ?? 1, asset.animation?.speedVariation ?? 0).startFrame / (asset.animation?.frameCount ?? 1),
      texturePage: asset.staticAsset ?? asset.runtimeAsset ?? asset.texture ?? null,
      ...(animatedMaterial ? { animatedMaterial } : {})
    });
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
  for (const instance of stageRank(diagnosticStage) >= stageRank('effects') ? manifest.effects : []) {
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
    diagnostics: () => ({
      terrain: {
        assetId: terrainAsset.id,
        textureUrl: terrainAsset.runtimeAsset ?? terrainAsset.texture ?? null,
        material: terrain.material.type,
        color: `#${terrain.material.color.getHexString()}`,
        opacity: terrain.material.opacity,
        transparent: terrain.material.transparent,
        depthWrite: terrain.material.depthWrite,
        depthTest: terrain.material.depthTest,
        renderOrder: terrain.renderOrder
      },
      textures: [...textureDiagnostics.values()].map((diagnostic) => ({ ...diagnostic })),
      objects: cards.map((card) => ({
        assetId: card.asset.id,
        assetVersion: card.asset.assetVersion ?? 1,
        instanceId: card.instanceId,
        renderClass: card.renderClass,
        provenance: card.asset.provenance?.source ?? (manifest.version === 1 ? 'phase-8c5-legacy-prototype' : 'unknown'),
        runtimeTextureUrl: card.asset.staticAsset ?? card.asset.runtimeAsset ?? card.asset.texture ?? null,
        position: { x: card.root.position.x, y: card.root.position.y, z: card.root.position.z },
        scale: { x: card.root.scale.x, y: card.root.scale.y, z: card.root.scale.z },
        visible: card.root.visible,
        renderOrder: card.root.renderOrder,
        animated: Boolean(card.asset.animation),
        selectedDirection: card.selectedDirection,
        cameraRelativeAngleDegrees: card.cameraRelativeAngle === null ? null : card.cameraRelativeAngle * 180 / Math.PI,
        animationFrame: card.animationFrame,
        animationFrames: card.asset.animation?.frameCount ?? 1,
        fps: card.asset.animation?.fps ?? 0,
        animationPhase: card.normalizedPhase,
        instancePhaseOffset: card.instancePhaseOffset,
        groundAnchor: card.asset.groundAnchor ?? card.asset.pivot,
        collisionFootprint: manifest.props.find((instance) => instance.id === card.instanceId)?.collisionRef ?? null,
        lod: card.lod,
        textureMemoryBytes: (card.texturePage?.includes('-frame-00.png') ? 256 * 256 : card.texturePage?.includes('/idle/') ? 1280 * 1280 : card.asset.width * card.asset.height) * 4,
        texturePage: card.texturePage,
        loadStatus: card.texturePage ? textureDiagnostics.get(card.texturePage)?.status ?? 'unknown' : 'unknown'
      }))
    }),
    setQuality: (nextQuality) => {
      quality = nextQuality;
      qualityObjects.forEach(({ object, asset }) => { object.visible = visibleAtQuality(asset, nextQuality); });
      metrics.visibleProps = cards.filter((card) => card.root.visible).length;
    },
    setMoonberryEmphasis: (active) => { emphasized = active; },
    update: (elapsed, cameraPosition) => {
      const started = performance.now();
      const activeAnimationAssets = new Set<string>();
      for (const card of cards) {
        if (!card.root.visible || !cameraPosition) continue;
        const distance = horizontalEnvironmentDistance(cameraPosition.x, cameraPosition.z, card.root.position.x, card.root.position.z);
        card.lod = card.asset.id === 'tree.broadleaf' && debugOverrides.broadleafLod
          ? debugOverrides.broadleafLod
          : resolveEnvironmentLod(distance, card.asset.lod?.midDistance ?? 12, card.asset.lod?.farDistance ?? 22);
        if (card.renderClass !== 'ground-prop' && card.renderClass !== 'ground-detail') {
          // Cylindrical billboard: the card's world-space normal faces the camera,
          // while its root and ground anchor remain fixed and pitch never tilts it.
          card.card.rotation.set(0, cylindricalBillboardYaw(
            cameraPosition.x, cameraPosition.z, card.root.position.x, card.root.position.z
          ), 0);
        }
        if (card.renderClass === 'directional-impostor') {
          card.cameraRelativeAngle = cameraRelativeEnvironmentAngle(cameraPosition.x, cameraPosition.z, card.root.position.x, card.root.position.z, card.authoredYaw);
          card.selectedDirection = card.asset.id === 'tree.broadleaf' && debugOverrides.broadleafDirection
            ? debugOverrides.broadleafDirection
            : resolveEnvironmentDirection(card.cameraRelativeAngle, card.selectedDirection ?? undefined);
          const direction = directionalAnimation(card.asset, card.selectedDirection);
          if (direction) {
            const requestedStatic = textureFor(card.asset, direction.staticAsset);
            const staticStatus = textureDiagnostics.get(direction.staticAsset)?.status;
            if (staticStatus === 'loaded' || staticStatus === 'server-fallback') {
              card.staticTexture = requestedStatic;
              card.texturePage = direction.staticAsset;
            }
          }
        }
      }
      if (quality === 'full' && cameraPosition && stageRank(diagnosticStage) >= stageRank('animation')) {
        const candidates = cards.filter((card) => card.root.visible && card.asset.animation && card.lod !== 'far')
          .map((card) => ({ card, distance: horizontalEnvironmentDistance(cameraPosition.x, cameraPosition.z, card.root.position.x, card.root.position.z) }))
          .filter((entry) => entry.distance < 12)
          .sort((left, right) => left.distance - right.distance);
        for (const { card } of candidates) {
          activeAnimationAssets.add(`${card.asset.id}:${card.selectedDirection ?? 'default'}`);
          if (activeAnimationAssets.size >= MAX_ACTIVE_ENVIRONMENT_ATLASES) break;
        }
      }
      for (const [assetId, texture] of animationTextures) if (!activeAnimationAssets.has(assetId)) {
        texture.dispose();
        animationTextures.delete(assetId);
      }
      for (const card of cards) {
        if (!card.root.visible) continue;
        const animation = card.asset.animation;
        if (animation && card.animatedMaterial) {
          const animationKey = `${card.asset.id}:${card.selectedDirection ?? 'default'}`;
          const animate = activeAnimationAssets.has(animationKey);
          const directionAnimation = directionalAnimation(card.asset, card.selectedDirection);
          const effectiveElapsed = card.asset.id === 'tree.broadleaf' && debugOverrides.broadleafFps
            ? elapsed * debugOverrides.broadleafFps / animation.fps
            : elapsed;
          card.normalizedPhase = environmentNormalizedPhaseAt(card.asset, card.instanceId, effectiveElapsed, animate);
          const frameCount = directionAnimation?.frameCount ?? animation.frameCount;
          const frame = card.asset.id === 'tree.broadleaf' && debugOverrides.broadleafFrame !== undefined
            ? Math.min(frameCount - 1, Math.max(0, debugOverrides.broadleafFrame))
            : environmentFrameForPhase(card.normalizedPhase, frameCount);
          card.animationFrame = frame;
          const animatedTexture = animate ? animationTextureFor(card.asset, card.selectedDirection) : null;
          const animationUrl = directionAnimation?.sheet ?? animation.sheet;
          const animationLoaded = textureDiagnostics.get(animationUrl)?.status === 'loaded';
          card.animatedMaterial.uniforms.atlas!.value = animate && animationLoaded && animatedTexture ? animatedTexture : card.staticTexture;
          card.texturePage = animate && animationLoaded ? animationUrl : card.texturePage;
          if (!animate) {
            card.animatedMaterial.uniforms.atlasRegion!.value.set(0, 0, 1, 1);
            continue;
          }
          const columns = directionAnimation?.columns ?? animation.columns;
          const region = environmentAtlasRegionForFrame(frame, frameCount, columns);
          card.animatedMaterial.uniforms.atlasRegion!.value.set(region.x, region.y, region.width, region.height);
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
