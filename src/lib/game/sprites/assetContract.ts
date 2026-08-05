import { FACING_DIRECTIONS, type FacingDirection } from '../facing';

export type SpriteAnimationState = 'idle' | 'walk' | (string & {});
export type AtlasCell = { column: number; row: number };
export type SpritePoint = { x: number; y: number };
export type ShadowFootprint = { width: number; depth: number; opacity: number; offsetY: number };
export type SpriteAtlasPage = { id: string; image: string; imageWidth: number; imageHeight: number };
export type SpriteAtlasFrame = AtlasCell & { page: string };
export type SpriteDirectionSequence = { frames: readonly SpriteAtlasFrame[]; fps?: number; loop?: boolean };
export type SpriteAnimationClip = {
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
  directions: Record<FacingDirection, SpriteDirectionSequence>;
  pivot: SpritePoint;
  feet: SpritePoint;
  visualScale: { heightWorldUnits: number };
  shadow?: ShadowFootprint;
  effectAnchors?: Record<string, SpritePoint>;
  labelAnchor?: SpritePoint;
  ownerSpacing?: { preferredWorldUnits: number; minimumWorldUnits: number };
};
export type SpriteAssetContract = {
  version: 1 | 2;
  id: string;
  status: 'temporary' | 'production';
  pages: readonly SpriteAtlasPage[];
  nativeDirections: true;
  directionOrder: readonly FacingDirection[];
  animations: Record<string, SpriteAnimationClip>;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finitePositive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const point = (value: unknown): value is SpritePoint => {
  const item = record(value);
  return Boolean(item && typeof item.x === 'number' && Number.isFinite(item.x) && typeof item.y === 'number' && Number.isFinite(item.y));
};

const optionalPresentation = (item: Record<string, unknown>, clip: SpriteAnimationClip) => {
  const shadow = record(item.shadow);
  if (shadow && finitePositive(shadow.width) && finitePositive(shadow.depth) && typeof shadow.opacity === 'number' && typeof shadow.offsetY === 'number') {
    clip.shadow = { width: Number(shadow.width), depth: Number(shadow.depth), opacity: Number(shadow.opacity), offsetY: Number(shadow.offsetY) };
  }
  if (point(item.labelAnchor)) clip.labelAnchor = item.labelAnchor;
  const spacing = record(item.ownerSpacing);
  if (spacing && finitePositive(spacing.preferredWorldUnits) && finitePositive(spacing.minimumWorldUnits)) {
    clip.ownerSpacing = { preferredWorldUnits: Number(spacing.preferredWorldUnits), minimumWorldUnits: Number(spacing.minimumWorldUnits) };
  }
  const anchors = record(item.effectAnchors);
  if (anchors) clip.effectAnchors = Object.fromEntries(
    Object.entries(anchors).filter((entry): entry is [string, SpritePoint] => point(entry[1]))
  );
};

const frameFits = (frame: SpriteAtlasFrame, clip: Pick<SpriteAnimationClip, 'frameWidth' | 'frameHeight'>, pages: Map<string, SpriteAtlasPage>) => {
  const page = pages.get(frame.page);
  return Boolean(page && (frame.column + 1) * clip.frameWidth <= page.imageWidth && (frame.row + 1) * clip.frameHeight <= page.imageHeight);
};

const parseV1Clip = (value: unknown, page: SpriteAtlasPage): SpriteAnimationClip | null => {
  const item = record(value);
  const directions = record(item?.directions);
  const scale = record(item?.visualScale);
  if (!item || !directions || !scale || !finitePositive(item.frameWidth) || !finitePositive(item.frameHeight) ||
    !Number.isInteger(item.frameCount) || !finitePositive(item.frameCount) || !finitePositive(item.fps) ||
    typeof item.loop !== 'boolean' || !point(item.pivot) || !point(item.feet) || !finitePositive(scale.heightWorldUnits)) return null;
  const clip: SpriteAnimationClip = {
    frameWidth: Number(item.frameWidth), frameHeight: Number(item.frameHeight), fps: Number(item.fps), loop: item.loop,
    directions: {} as Record<FacingDirection, SpriteDirectionSequence>, pivot: item.pivot, feet: item.feet,
    visualScale: { heightWorldUnits: Number(scale.heightWorldUnits) }
  };
  for (const direction of FACING_DIRECTIONS) {
    const cell = record(directions[direction]);
    if (!cell || !Number.isInteger(cell.column) || !Number.isInteger(cell.row) || Number(cell.column) < 0 || Number(cell.row) < 0) return null;
    const frames = Array.from({ length: Number(item.frameCount) }, (_, index) => ({
      page: page.id, column: Number(cell.column) + index, row: Number(cell.row)
    }));
    if (frames.some((frame) => !frameFits(frame, clip, new Map([[page.id, page]])))) return null;
    clip.directions[direction] = { frames };
  }
  optionalPresentation(item, clip);
  return clip;
};

const parseV2Pages = (value: unknown): SpriteAtlasPage[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids = new Set<string>();
  const pages: SpriteAtlasPage[] = [];
  for (const valuePage of value) {
    const page = record(valuePage);
    if (!page || typeof page.id !== 'string' || !page.id || ids.has(page.id) || typeof page.image !== 'string' || !page.image ||
      !finitePositive(page.imageWidth) || !finitePositive(page.imageHeight)) return null;
    ids.add(page.id);
    pages.push({ id: page.id, image: page.image, imageWidth: Number(page.imageWidth), imageHeight: Number(page.imageHeight) });
  }
  return pages;
};

const parseV2Clip = (value: unknown, pages: Map<string, SpriteAtlasPage>): SpriteAnimationClip | null => {
  const item = record(value);
  const directions = record(item?.directions);
  const scale = record(item?.visualScale);
  if (!item || !directions || !scale || !finitePositive(item.frameWidth) || !finitePositive(item.frameHeight) ||
    !finitePositive(item.fps) || typeof item.loop !== 'boolean' || !point(item.pivot) || !point(item.feet) ||
    !finitePositive(scale.heightWorldUnits)) return null;
  const clip: SpriteAnimationClip = {
    frameWidth: Number(item.frameWidth), frameHeight: Number(item.frameHeight), fps: Number(item.fps), loop: item.loop,
    directions: {} as Record<FacingDirection, SpriteDirectionSequence>, pivot: item.pivot, feet: item.feet,
    visualScale: { heightWorldUnits: Number(scale.heightWorldUnits) }
  };
  for (const direction of FACING_DIRECTIONS) {
    const sequence = record(directions[direction]);
    if (!sequence || !Array.isArray(sequence.frames) || sequence.frames.length === 0) return null;
    const frames: SpriteAtlasFrame[] = [];
    for (const valueFrame of sequence.frames) {
      const frame = record(valueFrame);
      if (!frame || typeof frame.page !== 'string' || !Number.isInteger(frame.column) || !Number.isInteger(frame.row) ||
        Number(frame.column) < 0 || Number(frame.row) < 0) return null;
      const parsed = { page: frame.page, column: Number(frame.column), row: Number(frame.row) };
      if (!frameFits(parsed, clip, pages)) return null;
      frames.push(parsed);
    }
    if (sequence.fps !== undefined && !finitePositive(sequence.fps)) return null;
    if (sequence.loop !== undefined && typeof sequence.loop !== 'boolean') return null;
    clip.directions[direction] = {
      frames,
      ...(sequence.fps !== undefined ? { fps: Number(sequence.fps) } : {}),
      ...(sequence.loop !== undefined ? { loop: sequence.loop } : {})
    };
  }
  optionalPresentation(item, clip);
  return clip;
};

export const parseSpriteAssetContract = (value: unknown): SpriteAssetContract | null => {
  const item = record(value);
  if (!item || (item.version !== 1 && item.version !== 2) || typeof item.id !== 'string' || !item.id ||
    (item.status !== 'temporary' && item.status !== 'production') || item.nativeDirections !== true || !Array.isArray(item.directionOrder)) return null;
  const directionOrder = item.directionOrder as unknown[];
  if (directionOrder.length !== FACING_DIRECTIONS.length || FACING_DIRECTIONS.some((direction, index) => directionOrder[index] !== direction)) return null;
  let pages: SpriteAtlasPage[];
  if (item.version === 1) {
    if (typeof item.image !== 'string' || !item.image || !finitePositive(item.imageWidth) || !finitePositive(item.imageHeight)) return null;
    pages = [{ id: 'default', image: item.image, imageWidth: Number(item.imageWidth), imageHeight: Number(item.imageHeight) }];
  } else {
    const parsedPages = parseV2Pages(item.pages);
    if (!parsedPages) return null;
    pages = parsedPages;
  }
  const animations = record(item.animations);
  if (!animations) return null;
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  const parsed: Record<string, SpriteAnimationClip> = {};
  for (const [name, valueClip] of Object.entries(animations)) {
    const clip = item.version === 1 ? parseV1Clip(valueClip, pages[0]!) : parseV2Clip(valueClip, pageMap);
    if (!clip) return null;
    parsed[name] = clip;
  }
  if (!parsed.idle || !parsed.walk) return null;
  return { version: item.version, id: item.id, status: item.status, pages, nativeDirections: true, directionOrder: [...FACING_DIRECTIONS], animations: parsed };
};

export type AtlasUv = { page: string; u: number; v: number; width: number; height: number; frame: number; totalFrames: number; fps: number; loop: boolean };
export const sequenceFor = (asset: SpriteAssetContract, state: SpriteAnimationState, facing: FacingDirection) => {
  const clip = asset.animations[state] ?? asset.animations.idle!;
  const sequence = clip.directions[facing];
  return { clip, sequence, fps: sequence.fps ?? clip.fps, loop: sequence.loop ?? clip.loop };
};

export type SpritePresentationLayout = { width: number; height: number; centerY: number; labelY: number };
export const spritePresentationLayout = (clip: SpriteAnimationClip): SpritePresentationLayout => {
  const height = clip.visualScale.heightWorldUnits;
  return {
    width: height * clip.frameWidth / clip.frameHeight, height,
    centerY: height * (clip.feet.y - 0.5),
    labelY: clip.labelAnchor ? height * (1 - clip.labelAnchor.y) : height + 0.25
  };
};

export const atlasUvFor = (asset: SpriteAssetContract, state: SpriteAnimationState, facing: FacingDirection, frame: number): AtlasUv => {
  const selection = sequenceFor(asset, state, facing);
  const safeFrame = Math.max(0, Math.min(selection.sequence.frames.length - 1, Math.floor(frame)));
  const atlasFrame = selection.sequence.frames[safeFrame]!;
  const page = asset.pages.find((candidate) => candidate.id === atlasFrame.page)!;
  const x = atlasFrame.column * selection.clip.frameWidth;
  const y = atlasFrame.row * selection.clip.frameHeight;
  return {
    page: page.id, u: x / page.imageWidth, v: 1 - (y + selection.clip.frameHeight) / page.imageHeight,
    width: selection.clip.frameWidth / page.imageWidth, height: selection.clip.frameHeight / page.imageHeight,
    frame: safeFrame, totalFrames: selection.sequence.frames.length, fps: selection.fps, loop: selection.loop
  };
};

export const pageFor = (asset: SpriteAssetContract, pageId: string) => asset.pages.find((page) => page.id === pageId) ?? null;
export const resolveAssetImageUrl = (manifestUrl: string, image: string) => new URL(image, new URL(manifestUrl, globalThis.location?.origin ?? 'http://localhost')).toString();
