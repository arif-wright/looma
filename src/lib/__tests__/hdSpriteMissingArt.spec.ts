import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FACING_DIRECTIONS } from '$lib/game/facing';
import { HdSpriteEntity, HdSpriteResources, MUSE_ATLAS_URL, type HdSpriteOptions } from '$lib/game/renderers/three/hdSprite';
import { parseSpriteAssetContract, type SpriteAssetContract } from '$lib/game/sprites/assetContract';
import type { ResourceLease } from '$lib/game/sprites/atlasCache';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const lease = <T>(resource: T) => ({ resource, release: vi.fn() });
const contract = (idlePages = ['idle']): SpriteAssetContract => parseSpriteAssetContract({
  version: 2, id: 'muse-test-production', status: 'production', nativeDirections: true,
  directionOrder: FACING_DIRECTIONS,
  pages: [...new Set([...idlePages, 'walk-e', 'walk-n'])].map((id) => ({ id, image: `${id}.png`, imageWidth: 256, imageHeight: 256 })),
  animations: Object.fromEntries(['idle', 'walk'].map((state) => [state, {
    frameWidth: 256, frameHeight: 256, fps: 12, loop: true,
    directions: Object.fromEntries(FACING_DIRECTIONS.map((direction) => [direction, {
      frames: (state === 'idle' ? idlePages : [direction === 'n' ? 'walk-n' : 'walk-e'])
        .map((page) => ({ page, column: 0, row: 0 }))
    }])),
    pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 }
  }]))
})!;

let entities: HdSpriteEntity[];
let resourcesToDispose: HdSpriteResources[];
const resources = () => {
  const value = new HdSpriteResources();
  resourcesToDispose.push(value);
  return value;
};
const entity = (value: HdSpriteResources, options: Partial<HdSpriteOptions> = {}) => {
  const sprite = new HdSpriteEntity(value, { label: 'Muse', manifestUrl: MUSE_ATLAS_URL, companion: true, requireProduction: true, ...options });
  entities.push(sprite);
  return sprite;
};
const update = (sprite: HdSpriteEntity, facing: 's' | 'e' | 'n' = 's', state: 'idle' | 'walk' = 'idle') =>
  sprite.update(1 / 60, facing, 0, 0, 'full', 0, { state, facing });
const atlas = (sprite: HdSpriteEntity) => sprite.plane.material.uniforms.atlas!.value as THREE.Texture;

beforeEach(() => {
  entities = [];
  resourcesToDispose = [];
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ strokeText: vi.fn(), fillText: vi.fn() }) }) });
  // All network/image paths are mocked. These tests need neither a browser nor a server.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected fetch')));
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('Unexpected image request'));
});
afterEach(() => {
  entities.forEach((sprite) => sprite.destroy());
  resourcesToDispose.forEach((value) => value.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Three companion missing-art fallback', () => {
  it('does not configure player art as a companion fallback', () => {
    const source = readFileSync('src/lib/game/renderers/three/threeWorld.ts', 'utf8');
    const companionOptions = source.match(/visual\.follower = new HdSpriteEntity\(spriteResources, \{([\s\S]*?)\}\);/)?.[1];
    expect(companionOptions).toContain('manifestUrl: assetSelection.manifestUrl');
    expect(companionOptions).not.toContain('fallbackManifestUrl');
    expect(companionOptions).not.toContain('PLAYER_ATLAS_URL');
  });

  it.each([
    ['missing manifest', { ok: false, status: 404 }, 'Atlas metadata request failed (404)'],
    ['invalid manifest', { ok: true, json: async () => ({}) }, 'Atlas metadata is invalid']
  ])('uses only the safe-color placeholder for a %s', async (_name, response, error) => {
    vi.mocked(fetch).mockResolvedValue(response as Response);
    const value = resources();
    const sprite = entity(value);
    const placeholder = atlas(sprite);
    await settle();
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'failed', assetId: 'safe-color-fallback',
      requestedManifestUrl: MUSE_ATLAS_URL, resolvedManifestUrl: null, currentPageId: null,
      fallbackReason: `Primary asset failed: ${error}`, lastAssetError: error });
    expect(atlas(sprite)).toBe(placeholder);
    expect(sprite.animationDiagnostics).toBeNull();
    for (let index = 0; index < 10; index += 1) update(sprite);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(MUSE_ATLAS_URL, { credentials: 'same-origin' });
    expect(THREE.TextureLoader.prototype.loadAsync).not.toHaveBeenCalled();
  });

  it('rejects temporary metadata when production art was requested', async () => {
    const value = resources();
    const metadata = lease({ ...contract(), status: 'temporary' as const });
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    const acquirePage = vi.spyOn(value, 'acquirePage');
    const sprite = entity(value);
    await settle();
    expect(metadata.release).toHaveBeenCalledTimes(1);
    expect(acquirePage).not.toHaveBeenCalled();
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'failed', assetId: 'safe-color-fallback',
      lastAssetError: 'Expected production atlas, received temporary' });
  });

  it('detaches a contract whose initial atlas page cannot load and never retries from update', async () => {
    const value = resources();
    const metadata = lease(contract());
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    const pageRequest = vi.spyOn(value, 'acquirePage').mockRejectedValue(new Error('idle.png missing'));
    const sprite = entity(value);
    const placeholder = atlas(sprite);
    await settle();
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'failed', assetId: 'safe-color-fallback',
      currentPageId: null, currentPageUrl: null, lastAssetError: 'idle.png missing' });
    expect(metadata.release).toHaveBeenCalledTimes(1);
    expect(atlas(sprite)).toBe(placeholder);
    expect(sprite.animationDiagnostics).toBeNull();
    for (let index = 0; index < 10; index += 1) update(sprite, 'n', 'walk');
    await settle();
    expect(pageRequest).toHaveBeenCalledTimes(1);
    sprite.destroy();
    expect(metadata.release).toHaveBeenCalledTimes(1);
  });

  it('releases pages acquired both before and after a sibling page rejects', async () => {
    const value = resources();
    const metadata = lease(contract(['early', 'missing', 'late']));
    const early = lease(new THREE.Texture());
    const late = lease(new THREE.Texture());
    const pending = deferred<ResourceLease<THREE.Texture>>();
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    vi.spyOn(value, 'acquirePage').mockImplementation(async (_url, _contract, page) => {
      if (page === 'early') return early;
      if (page === 'missing') throw new Error('Missing sibling');
      return pending.promise;
    });
    const sprite = entity(value);
    await settle();
    expect(sprite.loadState).toBe('failed');
    expect(early.release).toHaveBeenCalledTimes(1);
    expect(metadata.release).toHaveBeenCalledTimes(1);
    pending.resolve(late);
    await settle();
    expect(late.release).toHaveBeenCalledTimes(1);
    sprite.destroy();
    expect(early.release).toHaveBeenCalledTimes(1);
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it('restores the placeholder and releases production pages after a later animation-page failure', async () => {
    const value = resources();
    const metadata = lease(contract());
    const idle = lease(new THREE.Texture());
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    const pageRequest = vi.spyOn(value, 'acquirePage').mockImplementation(async (_url, _contract, page) => {
      if (page === 'idle') return idle;
      throw new Error('walk-e.png missing');
    });
    const sprite = entity(value);
    const placeholder = atlas(sprite);
    const disposePlaceholder = vi.spyOn(placeholder, 'dispose');
    await settle();
    update(sprite);
    expect(sprite.assetDiagnostics.assetStatus).toBe('production');
    expect(atlas(sprite)).toBe(idle.resource);
    expect(disposePlaceholder).not.toHaveBeenCalled();
    update(sprite, 'e', 'walk');
    await settle();
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'failed', assetId: 'safe-color-fallback',
      currentPageId: null, currentPageUrl: null, fallbackReason: 'Atlas page failed: walk-e.png missing' });
    expect(atlas(sprite)).toBe(placeholder);
    expect(sprite.plane.material.uniforms.atlasRegion!.value.toArray()).toEqual([0, 0, 1, 1]);
    expect(sprite.plane.scale.toArray()).toEqual([2.2, 2.2, 1]);
    expect(idle.release).toHaveBeenCalledTimes(1);
    expect(metadata.release).toHaveBeenCalledTimes(1);
    update(sprite, 'e', 'walk');
    await settle();
    expect(pageRequest).toHaveBeenCalledTimes(2);
    sprite.destroy();
    expect(disposePlaceholder).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicitly configured generic fallback diagnosed as fallback', async () => {
    const value = resources();
    const primary = lease(contract());
    const fallback = lease({ ...contract(), id: 'explicit-fallback' });
    const fallbackPage = lease(new THREE.Texture());
    vi.spyOn(value, 'acquireContract').mockResolvedValueOnce(primary).mockResolvedValueOnce(fallback);
    vi.spyOn(value, 'acquirePage').mockRejectedValueOnce(new Error('Primary page missing')).mockResolvedValue(fallbackPage);
    const sprite = entity(value, { companion: false, fallbackManifestUrl: '/explicit-fallback.json' });
    await settle();
    update(sprite);
    expect(primary.release).toHaveBeenCalledTimes(1);
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'fallback', assetId: 'explicit-fallback',
      fallbackReason: 'Primary asset failed: Primary page missing', currentPageId: 'idle' });
    expect(atlas(sprite)).toBe(fallbackPage.resource);
    sprite.destroy();
    expect(fallback.release).toHaveBeenCalledTimes(1);
    expect(fallbackPage.release).toHaveBeenCalledTimes(1);
  });
});

describe('HD sprite interrupted loads and cleanup', () => {
  it('shares successful page loads and disposes the cached texture only after the last entity leaves', async () => {
    const value = resources();
    const metadata = contract();
    const page = new THREE.Texture();
    const disposePage = vi.spyOn(page, 'dispose');
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => metadata } as Response);
    vi.mocked(THREE.TextureLoader.prototype.loadAsync).mockResolvedValue(page);
    const first = entity(value);
    const second = entity(value);
    await settle();
    update(first);
    update(second);
    const pageUrl = first.assetDiagnostics.currentPageUrl!;
    expect(first.assetDiagnostics.assetStatus).toBe('production');
    expect(second.assetDiagnostics.assetStatus).toBe('production');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(THREE.TextureLoader.prototype.loadAsync).toHaveBeenCalledTimes(1);
    expect(value.references(pageUrl)).toBe(2);
    expect(value.cacheSize).toBe(1);
    expect(value.estimatedTextureMemoryBytes).toBe(256 * 256 * 4);
    first.destroy();
    expect(value.references(pageUrl)).toBe(1);
    expect(disposePage).not.toHaveBeenCalled();
    second.destroy();
    expect(disposePage).toHaveBeenCalledTimes(1);
    expect(value.cacheSize).toBe(0);
    expect(value.estimatedTextureMemoryBytes).toBe(0);
  });

  it('releases a manifest arriving after destruction without requesting pages', async () => {
    const value = resources();
    const pending = deferred<ResourceLease<SpriteAssetContract>>();
    const metadata = lease(contract());
    vi.spyOn(value, 'acquireContract').mockReturnValue(pending.promise);
    const pageRequest = vi.spyOn(value, 'acquirePage');
    const sprite = entity(value);
    sprite.destroy();
    pending.resolve(metadata);
    await settle();
    expect(metadata.release).toHaveBeenCalledTimes(1);
    expect(pageRequest).not.toHaveBeenCalled();
    expect(sprite.root.children).toHaveLength(0);
    expect(sprite.animationDiagnostics).toBeNull();
  });

  it('does not start a configured fallback when a manifest fails after destruction', async () => {
    const value = resources();
    const pending = deferred<ResourceLease<SpriteAssetContract>>();
    const metadataRequest = vi.spyOn(value, 'acquireContract').mockReturnValue(pending.promise);
    const sprite = entity(value, { fallbackManifestUrl: '/explicit-fallback.json' });
    sprite.destroy();
    pending.reject(new Error('Late network failure'));
    await settle();
    expect(metadataRequest).toHaveBeenCalledTimes(1);
    expect(sprite.assetDiagnostics.lastAssetError).toBeNull();
  });

  it('releases pending atlas pages and per-entity resources exactly once during teardown', async () => {
    const value = resources();
    const metadata = lease(contract());
    const page = lease(new THREE.Texture());
    const pending = deferred<ResourceLease<THREE.Texture>>();
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    const pageRequest = vi.spyOn(value, 'acquirePage').mockReturnValue(pending.promise);
    const sprite = entity(value);
    const disposePlaceholder = vi.spyOn(atlas(sprite), 'dispose');
    const disposeMaterial = vi.spyOn(sprite.plane.material, 'dispose');
    const labelMaterial = sprite.label.material as THREE.SpriteMaterial;
    const disposeLabel = vi.spyOn(labelMaterial, 'dispose');
    const disposeLabelMap = vi.spyOn(labelMaterial.map!, 'dispose');
    const disposeSharedGeometry = vi.spyOn(value.planeGeometry, 'dispose');
    await settle();
    update(sprite, 'e', 'walk');
    expect(pageRequest).toHaveBeenCalledTimes(1);
    sprite.destroy();
    sprite.destroy();
    update(sprite);
    pending.resolve(page);
    await settle();
    expect(page.release).toHaveBeenCalledTimes(1);
    expect(metadata.release).toHaveBeenCalledTimes(1);
    for (const dispose of [disposePlaceholder, disposeMaterial, disposeLabel, disposeLabelMap]) expect(dispose).toHaveBeenCalledTimes(1);
    expect(disposeSharedGeometry).not.toHaveBeenCalled();
    expect(sprite.root.children).toHaveLength(0);
    expect(sprite.animationDiagnostics).toBeNull();
    expect(sprite.loadState).not.toBe('loaded');
  });

  it('ignores a stale direction-page failure after the newest direction loaded', async () => {
    const value = resources();
    const metadata = lease(contract());
    const idle = lease(new THREE.Texture());
    const north = lease(new THREE.Texture());
    const east = deferred<ResourceLease<THREE.Texture>>();
    vi.spyOn(value, 'acquireContract').mockResolvedValue(metadata);
    vi.spyOn(value, 'acquirePage').mockImplementation(async (_url, _contract, page) => {
      if (page === 'idle') return idle;
      if (page === 'walk-n') return north;
      return east.promise;
    });
    const sprite = entity(value);
    await settle();
    update(sprite, 'e', 'walk');
    update(sprite, 'n', 'walk');
    await settle();
    update(sprite, 'n', 'walk');
    east.reject(new Error('Obsolete east page missing'));
    await settle();
    expect(sprite.assetDiagnostics).toMatchObject({ assetStatus: 'production', currentPageId: 'walk-n', lastAssetError: null });
    expect(atlas(sprite)).toBe(north.resource);
    expect(idle.release).toHaveBeenCalledTimes(1);
    sprite.destroy();
    expect(north.release).toHaveBeenCalledTimes(1);
    expect(metadata.release).toHaveBeenCalledTimes(1);
  });
});
