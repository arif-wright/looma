import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACING_DIRECTIONS } from '$lib/game/facing';
import { atlasUvFor, parseSpriteAssetContract, sequenceFor, spritePresentationLayout } from '$lib/game/sprites/assetContract';
import { effectsEnabledForQuality, MotionAnimationState, SpriteAnimator, yawOnlyBillboardRotation } from '$lib/game/sprites/animation';
import { acquireWithFallback, ReferenceAssetCache } from '$lib/game/sprites/atlasCache';

const fixture = (): unknown => ({
  version: 1, id: 'test-atlas', status: 'temporary', image: 'test.webp',
  imageWidth: 1024, imageHeight: 4096, nativeDirections: true, directionOrder: [...FACING_DIRECTIONS],
  animations: {
    idle: {
      frameWidth: 256, frameHeight: 256, frameCount: 2, fps: 2, loop: true,
      directions: Object.fromEntries(FACING_DIRECTIONS.map((direction, row) => [direction, { column: 0, row }])),
      pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 },
      shadow: { width: 1, depth: .5, opacity: .2, offsetY: .08 }, labelAnchor: { x: .5, y: -.03 }
    },
    walk: {
      frameWidth: 256, frameHeight: 256, frameCount: 4, fps: 8, loop: true,
      directions: Object.fromEntries(FACING_DIRECTIONS.map((direction, row) => [direction, { column: 0, row: row + 8 }])),
      pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 }
    }
  }
});
const variableFixture = (): unknown => ({
  version: 2, id: 'production-variable', status: 'production', nativeDirections: true,
  directionOrder: [...FACING_DIRECTIONS],
  pages: [
    { id: 'first', image: 'first.png', imageWidth: 4096, imageHeight: 256 },
    { id: 'second', image: 'second.png', imageWidth: 2048, imageHeight: 256 }
  ],
  animations: Object.fromEntries(['idle', 'walk'].map((state) => [state, {
    frameWidth: 256, frameHeight: 256, fps: state === 'idle' ? 12 : 18, loop: true,
    directions: Object.fromEntries(FACING_DIRECTIONS.map((direction) => [direction, {
      frames: Array.from({ length: direction === 'n' ? 24 : 7 }, (_, index) =>
        index < 16 ? { page: 'first', column: index, row: 0 } : { page: 'second', column: index - 16, row: 0 })
    }])), pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 }
  }]))
});

describe('HD sprite asset contract', () => {
  it.each([
    'static/game/sprites/companions/muse/muse.atlas.json',
    'static/game/sprites/players/placeholder/player-placeholder.atlas.json'
  ])('validates shipped atlas metadata %s', (path) => {
    expect(parseSpriteAssetContract(JSON.parse(readFileSync(path, 'utf8')))).not.toBeNull();
  });

  it('parses native eight-direction idle/walk metadata', () => {
    const asset = parseSpriteAssetContract(fixture());
    expect(asset?.directionOrder).toEqual(FACING_DIRECTIONS);
    expect(asset?.animations.walk?.directions.s.frames).toHaveLength(4);
  });

  it.each([
    ['missing direction', (value: any) => delete value.animations.idle.directions.n],
    ['mirrored direction declaration', (value: any) => { value.nativeDirections = false; }],
    ['out-of-bounds cells', (value: any) => { value.animations.walk.directions.n.row = 20; }],
    ['missing required state', (value: any) => delete value.animations.walk]
  ])('rejects invalid metadata: %s', (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(parseSpriteAssetContract(value)).toBeNull();
  });

  it('maps every facing to a distinct native atlas row without mirroring', () => {
    const asset = parseSpriteAssetContract(fixture())!;
    const rows = FACING_DIRECTIONS.map((direction) => atlasUvFor(asset, 'idle', direction, 0).v);
    expect(new Set(rows).size).toBe(8);
    expect(atlasUvFor(asset, 'walk', 'nw', 3).u).toBe(.75);
  });

  it('preserves explicit variable-length frame order across atlas pages', () => {
    const asset = parseSpriteAssetContract(variableFixture())!;
    expect(sequenceFor(asset, 'idle', 'n').sequence.frames).toHaveLength(24);
    expect(atlasUvFor(asset, 'idle', 'n', 15)).toMatchObject({ page: 'first', frame: 15, totalFrames: 24, fps: 12 });
    expect(atlasUvFor(asset, 'idle', 'n', 16)).toMatchObject({ page: 'second', frame: 16, totalFrames: 24 });
    expect(sequenceFor(asset, 'idle', 'e').sequence.frames).toHaveLength(7);
  });

  it('grounds the declared feet at world zero and places the label above the frame', () => {
    const clip = parseSpriteAssetContract(fixture())!.animations.idle!;
    const layout = spritePresentationLayout(clip);
    const feetWorldY = layout.centerY - layout.height / 2 + layout.height * (1 - clip.feet.y);
    expect(feetWorldY).toBeCloseTo(0);
    expect(layout.labelY).toBeGreaterThan(layout.height);
  });
});

describe('stable sprite animation state', () => {
  it('selects idle/walk with hysteresis so interpolation jitter does not flicker', () => {
    const state = new MotionAnimationState();
    expect(state.update(.02)).toBe('idle');
    expect(state.update(.03)).toBe('walk');
    expect(state.update(.018)).toBe('walk');
    expect(state.update(.005)).toBe('idle');
  });

  it('does not restart the same animation and retains idle facing', () => {
    const animator = new SpriteAnimator();
    animator.select('walk', 'e');
    animator.update(.2, { frameCount: 4, fps: 8, loop: true });
    animator.select('walk', 'ne');
    expect(animator.restarts).toBe(1);
    expect(animator.frame).toBeGreaterThan(0);
    animator.select('idle', 'ne');
    expect(animator.facing).toBe('ne');
    expect(animator.restarts).toBe(2);
  });

  it('reaches every frame in a 24-frame sequence in order and loops at metadata FPS', () => {
    const animator = new SpriteAnimator();
    const playback = { frameCount: 24, fps: 12, loop: true };
    const reached = [animator.frame];
    for (let index = 1; index < 24; index += 1) reached.push(animator.update(1 / 12, playback));
    expect(reached).toEqual(Array.from({ length: 24 }, (_, index) => index));
    expect(animator.update(1 / 12, playback)).toBe(0);
  });

  it('does not restart or change world-facing when direction frame counts differ', () => {
    const animator = new SpriteAnimator();
    animator.select('walk', 'n');
    animator.update(.5, { frameCount: 24, fps: 12, loop: true });
    animator.select('walk', 'e');
    animator.update(0, { frameCount: 7, fps: 12, loop: true });
    expect(animator.restarts).toBe(1);
    expect(animator.facing).toBe('e');
    expect(animator.elapsed).toBe(.5);
  });

  it('supports independent remote-player and companion motion transitions', () => {
    const remote = new MotionAnimationState();
    const companion = new MotionAnimationState();
    expect(remote.update(.4)).toBe('walk');
    expect(companion.update(0)).toBe('idle');
    expect(remote.update(0)).toBe('idle');
    expect(companion.update(.2)).toBe('walk');
  });

  it('disables optional effects before core animation at lower quality', () => {
    expect(effectsEnabledForQuality('full')).toBe(true);
    expect(effectsEnabledForQuality('reduced')).toBe(false);
    expect(effectsEnabledForQuality('minimum')).toBe(false);
  });

  it.each([0, Math.PI / 2, Math.PI, Math.PI * 1.75])('stays upright and readable through camera yaw %s', (yaw) => {
    expect(yawOnlyBillboardRotation(yaw)).toEqual({ x: 0, y: yaw, z: 0 });
  });

  it.each([5, 10, 20, 32])('updates animation deterministically at synthetic density %s', (density) => {
    const clip = parseSpriteAssetContract(fixture())!.animations.walk!;
    const animators = Array.from({ length: density }, () => new SpriteAnimator());
    for (let frame = 0; frame < 60; frame += 1) {
      animators.forEach((animator, index) => {
        animator.select('walk', FACING_DIRECTIONS[index % 8]!);
        const sequence = clip.directions[FACING_DIRECTIONS[index % 8]!]!;
        animator.update(1 / 60, { frameCount: sequence.frames.length, fps: sequence.fps ?? clip.fps, loop: sequence.loop ?? clip.loop });
      });
    }
    expect(animators.every((animator) => animator.frame >= 0 && animator.frame < clip.directions[animator.facing]!.frames.length)).toBe(true);
  });

  it('caches and releases independent atlas pages without leaking', async () => {
    const cache = new ReferenceAssetCache<{ page: string }>();
    const dispose = vi.fn();
    const first = await cache.acquire('page-1', async () => ({ page: 'one' }), dispose);
    const second = await cache.acquire('page-2', async () => ({ page: 'two' }), dispose);
    expect(cache.size()).toBe(2);
    first.release();
    expect(cache.size()).toBe(1);
    second.release();
    expect(cache.size()).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});

describe('atlas resource cache', () => {
  it('deduplicates concurrent loads, reuses resources, and disposes after the last release', async () => {
    const cache = new ReferenceAssetCache<{ id: string }>();
    const loader = vi.fn(async () => ({ id: 'shared' }));
    const dispose = vi.fn();
    const [first, second] = await Promise.all([cache.acquire('atlas', loader, dispose), cache.acquire('atlas', loader, dispose)]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.resource).toBe(second.resource);
    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
  });

  it('uses a valid fallback after primary asset failure', async () => {
    const cache = new ReferenceAssetCache<string>();
    const lease = await acquireWithFallback(cache,
      { key: 'bad', load: async () => { throw new Error('decode failed'); } },
      { key: 'fallback', load: async () => 'safe atlas' }, vi.fn());
    expect(lease.fallback).toBe(true);
    expect(lease.resource).toBe('safe atlas');
    lease.release();
  });
});
