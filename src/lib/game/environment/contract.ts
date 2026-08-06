export const ENVIRONMENT_LAYERS = [
  'terrain', 'terrain-detail', 'low-vegetation', 'prop', 'actor',
  'companion', 'foreground', 'effect', 'label'
] as const;
export type EnvironmentLayer = (typeof ENVIRONMENT_LAYERS)[number];
export type EnvironmentQuality = 'full' | 'reduced' | 'minimum';
export type EnvironmentAssetStatus = 'prototype' | 'production' | 'fallback';
export type EnvironmentAssetKind = 'surface' | 'path' | 'prop' | 'interactable' | 'effect';

export type EnvironmentAssetDefinition = {
  id: string;
  kind: EnvironmentAssetKind;
  status: EnvironmentAssetStatus;
  layer: EnvironmentLayer;
  renderer: 'surface' | 'geometry' | 'billboard' | 'particles';
  width: number;
  height: number;
  pivot: { x: number; y: number };
  color?: string;
  texture?: string;
  fallbackAssetId?: string;
  obstruction: boolean;
  ambientAnimation?: 'sway' | 'pulse' | 'drift';
  glow?: { color: string; intensity: number };
  quality: EnvironmentQuality[];
  category?: 'terrain' | 'tree' | 'rock' | 'vegetation' | 'magical' | 'effect';
  runtimeAsset?: string;
  staticAsset?: string;
  animation?: {
    sheet: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    columns: number;
    fps: number;
    loop: boolean;
    calmSeconds?: [number, number];
    speedVariation?: number;
  };
  worldScale?: { width: number; height: number };
  collisionBehavior?: 'none' | 'authoritative-ref';
  shadow?: { enabled: boolean; width: number; depth: number; opacity: number };
  interactionType?: 'moonberry-gather';
  mirrorApproved?: boolean;
};

export type EnvironmentPropInstance = {
  id: string;
  assetId: string;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  collisionRef?: string;
};

export type EnvironmentDecorationField = {
  id: string;
  assetIds: string[];
  seed: number;
  count: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  exclusionRadius: number;
};

export type EnvironmentManifest = {
  version: 1;
  mapId: string;
  status: EnvironmentAssetStatus;
  units: 'server';
  assets: EnvironmentAssetDefinition[];
  terrain: { surfaceAssetId: string; secondarySurfaceAssetId?: string; pathAssetId: string; pathEdgeAssetId?: string; pathCenterline: Array<{ x: number; y: number; width: number }> };
  props: EnvironmentPropInstance[];
  decorations: EnvironmentDecorationField[];
  interactables: Array<EnvironmentPropInstance & { interactionRef: string }>;
  effects: EnvironmentPropInstance[];
};

export type EnvironmentValidation = { ok: boolean; errors: string[]; manifest: EnvironmentManifest | null };

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const id = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{1,63}$/.test(value);
const point = (value: unknown) => object(value) && finite(value.x) && finite(value.y);

export const validateEnvironmentManifest = (
  value: unknown,
  collisionIds: ReadonlySet<string> = new Set()
): EnvironmentValidation => {
  const errors: string[] = [];
  if (!object(value)) return { ok: false, errors: ['Manifest must be an object.'], manifest: null };
  if (value.version !== 1) errors.push('version must be 1.');
  if (!id(value.mapId)) errors.push('mapId is invalid.');
  if (!['prototype', 'production', 'fallback'].includes(String(value.status))) errors.push('status is invalid.');
  if (value.units !== 'server') errors.push('units must be server.');
  const assets = Array.isArray(value.assets) ? value.assets : [];
  if (!Array.isArray(value.assets) || assets.length === 0) errors.push('assets must be non-empty.');
  const assetIds = new Set<string>();
  const assetDefinitions = new Map<string, Record<string, unknown>>();
  for (const [index, raw] of assets.entries()) {
    if (!object(raw) || !id(raw.id)) { errors.push(`assets[${index}].id is invalid.`); continue; }
    if (assetIds.has(raw.id as string)) errors.push(`Duplicate asset id: ${raw.id}.`);
    assetIds.add(raw.id as string);
    assetDefinitions.set(raw.id as string, raw);
    if (!['surface', 'path', 'prop', 'interactable', 'effect'].includes(String(raw.kind))) errors.push(`${raw.id}.kind is invalid.`);
    if (!['prototype', 'production', 'fallback'].includes(String(raw.status))) errors.push(`${raw.id}.status is invalid.`);
    if (!ENVIRONMENT_LAYERS.includes(raw.layer as EnvironmentLayer)) errors.push(`${raw.id}.layer is invalid.`);
    if (!['surface', 'geometry', 'billboard', 'particles'].includes(String(raw.renderer))) errors.push(`${raw.id}.renderer is invalid.`);
    if (!finite(raw.width) || (raw.width as number) <= 0 || !finite(raw.height) || (raw.height as number) <= 0) errors.push(`${raw.id} dimensions must be positive.`);
    if (!point(raw.pivot) || (raw.pivot as { x: number; y: number }).x < 0 || (raw.pivot as { x: number; y: number }).x > 1 || (raw.pivot as { x: number; y: number }).y < 0 || (raw.pivot as { x: number; y: number }).y > 1) errors.push(`${raw.id}.pivot is invalid.`);
    if (typeof raw.obstruction !== 'boolean') errors.push(`${raw.id}.obstruction must be boolean.`);
    if (!Array.isArray(raw.quality) || raw.quality.some((item) => !['full', 'reduced', 'minimum'].includes(String(item)))) errors.push(`${raw.id}.quality is invalid.`);
    if (raw.texture !== undefined && (typeof raw.texture !== 'string' || !raw.texture.startsWith('/game/environment/'))) errors.push(`${raw.id}.texture must use /game/environment/.`);
    if (raw.runtimeAsset !== undefined && (typeof raw.runtimeAsset !== 'string' || !raw.runtimeAsset.startsWith('/game/environment/'))) errors.push(`${raw.id}.runtimeAsset must use /game/environment/.`);
    if (raw.staticAsset !== undefined && (typeof raw.staticAsset !== 'string' || !raw.staticAsset.startsWith('/game/environment/'))) errors.push(`${raw.id}.staticAsset must use /game/environment/.`);
    if (raw.worldScale !== undefined && (!object(raw.worldScale) || !finite(raw.worldScale.width) || Number(raw.worldScale.width) <= 0 || !finite(raw.worldScale.height) || Number(raw.worldScale.height) <= 0)) errors.push(`${raw.id}.worldScale is invalid.`);
    if (raw.collisionBehavior !== undefined && !['none', 'authoritative-ref'].includes(String(raw.collisionBehavior))) errors.push(`${raw.id}.collisionBehavior is invalid.`);
    if (raw.animation !== undefined) {
      if (!object(raw.animation) || typeof raw.animation.sheet !== 'string' || !raw.animation.sheet.startsWith('/game/environment/') || !Number.isSafeInteger(raw.animation.frameWidth) || !Number.isSafeInteger(raw.animation.frameHeight) || !Number.isSafeInteger(raw.animation.frameCount) || !Number.isSafeInteger(raw.animation.columns) || !finite(raw.animation.fps) || Number(raw.animation.frameWidth) <= 0 || Number(raw.animation.frameHeight) <= 0 || Number(raw.animation.frameCount) <= 1 || Number(raw.animation.columns) <= 0 || Number(raw.animation.fps) <= 0 || typeof raw.animation.loop !== 'boolean') errors.push(`${raw.id}.animation is invalid.`);
    }
    if (raw.shadow !== undefined && (!object(raw.shadow) || typeof raw.shadow.enabled !== 'boolean' || !finite(raw.shadow.width) || !finite(raw.shadow.depth) || !finite(raw.shadow.opacity))) errors.push(`${raw.id}.shadow is invalid.`);
    if (raw.status === 'production' && raw.renderer === 'billboard' && raw.texture === undefined && raw.fallbackAssetId === undefined) errors.push(`${raw.id} production billboard requires a texture or fallbackAssetId.`);
  }
  const checkAsset = (assetId: unknown, context: string) => { if (!assetIds.has(String(assetId))) errors.push(`${context} references unknown asset ${String(assetId)}.`); };
  if (!object(value.terrain) || !Array.isArray(value.terrain.pathCenterline) || value.terrain.pathCenterline.length < 2) errors.push('terrain pathCenterline requires at least two points.');
  else {
    checkAsset(value.terrain.surfaceAssetId, 'terrain'); checkAsset(value.terrain.pathAssetId, 'terrain');
    if (value.terrain.secondarySurfaceAssetId !== undefined) checkAsset(value.terrain.secondarySurfaceAssetId, 'terrain');
    if (value.terrain.pathEdgeAssetId !== undefined) checkAsset(value.terrain.pathEdgeAssetId, 'terrain');
    value.terrain.pathCenterline.forEach((item, index) => { if (!point(item) || !finite((item as Record<string, unknown>).width) || Number((item as Record<string, unknown>).width) <= 0) errors.push(`pathCenterline[${index}] is invalid.`); });
  }
  const validateInstances = (raw: unknown, label: string, interaction = false) => {
    if (!Array.isArray(raw)) { errors.push(`${label} must be an array.`); return; }
    for (const [index, item] of raw.entries()) {
      if (!object(item) || !id(item.id) || !point(item)) { errors.push(`${label}[${index}] is invalid.`); continue; }
      checkAsset(item.assetId, `${label}[${index}]`);
      const asset = assetDefinitions.get(String(item.assetId));
      if (label === 'props' && asset?.obstruction === true && item.collisionRef === undefined) errors.push(`${label}[${index}] blocking asset requires collisionRef.`);
      if (label === 'props' && asset?.obstruction === false && item.collisionRef !== undefined) errors.push(`${label}[${index}] non-blocking asset must not reference collision.`);
      if (item.collisionRef !== undefined && !collisionIds.has(String(item.collisionRef))) errors.push(`${label}[${index}] has unknown collisionRef.`);
      if (interaction && !id(item.interactionRef)) errors.push(`${label}[${index}].interactionRef is invalid.`);
      if ('radius' in item || 'collisionShape' in item) errors.push(`${label}[${index}] must not define collision geometry.`);
    }
  };
  validateInstances(value.props, 'props');
  validateInstances(value.interactables, 'interactables', true);
  validateInstances(value.effects, 'effects');
  if (!Array.isArray(value.decorations)) errors.push('decorations must be an array.');
  else for (const [index, field] of value.decorations.entries()) {
    if (!object(field) || !id(field.id) || !Number.isSafeInteger(field.seed) || !Number.isSafeInteger(field.count) || Number(field.count) < 0 || Number(field.count) > 256 || !object(field.bounds)) errors.push(`decorations[${index}] is invalid.`);
    else {
      (Array.isArray(field.assetIds) ? field.assetIds : []).forEach((assetId) => checkAsset(assetId, `decorations[${index}]`));
      const bounds = field.bounds as Record<string, unknown>;
      if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, field.exclusionRadius].every(finite) || Number(bounds.minX) >= Number(bounds.maxX) || Number(bounds.minY) >= Number(bounds.maxY)) errors.push(`decorations[${index}] bounds are invalid.`);
    }
  }
  for (const asset of assets) if (object(asset) && asset.fallbackAssetId !== undefined) checkAsset(asset.fallbackAssetId, String(asset.id));
  return { ok: errors.length === 0, errors, manifest: errors.length ? null : value as unknown as EnvironmentManifest };
};

export const resolveEnvironmentAsset = (manifest: EnvironmentManifest, requestedId: string) => {
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const requested = assets.get(requestedId);
  if (!requested) return null;
  if (requested.texture || requested.renderer !== 'billboard') return requested;
  return requested.fallbackAssetId ? assets.get(requested.fallbackAssetId) ?? null : requested;
};

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};

export const deterministicDecoration = (field: EnvironmentDecorationField) => {
  const next = random(field.seed);
  return Array.from({ length: field.count }, (_, index) => ({
    id: `${field.id}-${index + 1}`,
    assetId: field.assetIds[index % field.assetIds.length]!,
    x: field.bounds.minX + next() * (field.bounds.maxX - field.bounds.minX),
    y: field.bounds.minY + next() * (field.bounds.maxY - field.bounds.minY),
    rotation: next() * Math.PI * 2,
    scale: 0.82 + next() * 0.36
  }));
};

export const visibleAtQuality = (asset: EnvironmentAssetDefinition, quality: EnvironmentQuality) => asset.quality.includes(quality);

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
};

export const environmentAnimationVariation = (instanceId: string, frameCount: number, speedVariation = 0) => {
  const value = hash(instanceId);
  const unit = value / 0xffff_ffff;
  return {
    startFrame: value % Math.max(1, frameCount),
    phaseSeconds: unit * Math.max(1, frameCount),
    playbackRate: 1 + (unit * 2 - 1) * Math.max(0, Math.min(0.25, speedVariation))
  };
};
