import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverRect, createOrbfieldRenderer, loadOrbfieldSkin, ORBFIELD_SKIN_URLS } from '$lib/games/orbfieldSkin';

function imageHarness() {
  const images: HTMLImageElement[] = [];
  const factory = () => {
    const image = { complete: false, naturalWidth: 128, naturalHeight: 128,
      onload: null, onerror: null, src: '', decode: vi.fn().mockResolvedValue(undefined),
      removeAttribute: vi.fn() } as unknown as HTMLImageElement;
    images.push(image); return image;
  };
  const ready = (index: number) => {
    Object.defineProperty(images[index], 'complete', { value: true });
    images[index]!.onload?.call(images[index]!, new Event('load'));
  };
  return { images, factory, ready };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Moonlit skin loading', () => {
  it('decodes only the four local assets once and removes callbacks after completion', async () => {
    const h = imageHarness(); const promise = loadOrbfieldSkin({ imageFactory: h.factory });
    expect(h.images.map((image) => image.src)).toEqual(Object.values(ORBFIELD_SKIN_URLS));
    h.images.forEach((_, index) => h.ready(index));
    const result = await promise;
    expect(result.complete).toBe(true); expect(Object.keys(result.assets)).toHaveLength(4);
    for (const image of h.images) { expect(image.decode).toHaveBeenCalledOnce(); expect(image.onload).toBeNull(); expect(image.onerror).toBeNull(); }
  });
  it('fails individual assets without losing decoded art or retrying', async () => {
    const h = imageHarness(); const promise = loadOrbfieldSkin({ imageFactory: h.factory });
    h.ready(0); h.images[1]!.onerror?.call(h.images[1], new Event('error'));
    h.ready(2); h.ready(3);
    const result = await promise;
    expect(result.complete).toBe(false); expect(result.assets.player).toBeUndefined();
    expect(Object.keys(result.assets)).toHaveLength(3); expect(h.images).toHaveLength(4);
  });
  it('bounds loading and ignores late decode after timeout', async () => {
    vi.useFakeTimers(); const h = imageHarness();
    let release!: () => void;
    const promise = loadOrbfieldSkin({ imageFactory: h.factory, timeoutMs: 250 });
    vi.mocked(h.images[0]!.decode).mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    h.ready(0); await vi.advanceTimersByTimeAsync(250);
    const result = await promise; expect(result).toEqual({ assets: {}, complete: false });
    release(); await Promise.resolve(); expect(result.assets).toEqual({});
    for (const image of h.images) expect(image.onload).toBeNull();
  });
  it('aborts and cancels pending image requests without empty src or retained handlers', async () => {
    const controller = new AbortController(); const h = imageHarness();
    const promise = loadOrbfieldSkin({ imageFactory: h.factory, signal: controller.signal });
    controller.abort(); expect(await promise).toEqual({ assets: {}, complete: false });
    for (const image of h.images) { expect(image.removeAttribute).toHaveBeenCalledWith('src'); expect(image.src).not.toBe(''); expect(image.onload).toBeNull(); }
  });
  it('makes no request when already aborted and handles unavailable Image', async () => {
    const controller = new AbortController(); controller.abort(); const factory = vi.fn();
    expect(await loadOrbfieldSkin({ signal: controller.signal, imageFactory: factory })).toEqual({ assets: {}, complete: false });
    expect(factory).not.toHaveBeenCalled();
    expect(await loadOrbfieldSkin({ imageFactory: () => { throw new Error('unavailable'); } })).toEqual({ assets: {}, complete: false });
  });
  it('falls back on a decode rejection or zero-sized image', async () => {
    const h = imageHarness(); const promise = loadOrbfieldSkin({ imageFactory: h.factory });
    vi.mocked(h.images[0]!.decode).mockRejectedValue(new Error('decode failed'));
    Object.defineProperty(h.images[1], 'naturalWidth', { value: 0 });
    h.images.forEach((_, index) => h.ready(index));
    const result = await promise;
    expect(result.assets.background).toBeUndefined(); expect(result.assets.player).toBeUndefined();
    expect(result.complete).toBe(false);
  });
});

describe('Moonlit skin renderer', () => {
  const context = () => ({ clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn() });
  const frame = { width: 960, height: 540, playerX: 480, playerY: 270, playerRadius: 12, hazardRadius: 8,
    elapsedMs: 100, slowMo: true, enemies: [{ x: 100, y: 110 }] };
  it('cover-crops in either orientation instead of stretching the art or changing world coordinates', () => {
    expect(coverRect(1536, 1024, 960, 540)).toEqual([0, 80, 1536, 864]);
    expect(coverRect(960, 640, 320, 640)).toEqual([320, 0, 320, 640]);
  });
  it('uses exact 24px player and 16px hazard art bounds and no random calls', () => {
    const ctx = context(), player = {} as HTMLImageElement, hazard = {} as HTMLImageElement;
    const random = vi.spyOn(Math, 'random');
    createOrbfieldRenderer(ctx as unknown as CanvasRenderingContext2D, { player, hazard }, true).draw(frame);
    expect(ctx.drawImage).toHaveBeenCalledWith(player, 468, 258, 24, 24);
    expect(ctx.drawImage).toHaveBeenCalledWith(hazard, 92, 102, 16, 16);
    expect(ctx.arc).toHaveBeenCalledWith(100, 110, 8, 0, Math.PI * 2);
    expect(random).not.toHaveBeenCalled();
  });
  it('uses static optional effects when reduced motion is enabled, including live preference changes', () => {
    const ctx = context(); let reduced = false;
    const renderer = createOrbfieldRenderer(ctx as unknown as CanvasRenderingContext2D, {}, () => reduced);
    renderer.draw(frame); expect(ctx.arc).not.toHaveBeenCalledWith(480, 270, 21, 0, Math.PI * 2);
    reduced = true; renderer.draw(frame); expect(ctx.arc).toHaveBeenCalledWith(480, 270, 21, 0, Math.PI * 2);
  });
  it('snapshots assets once and does no draw work after destruction', () => {
    const ctx = context(); const assets: { player?: HTMLImageElement } = {};
    const renderer = createOrbfieldRenderer(ctx as unknown as CanvasRenderingContext2D, assets);
    assets.player = {} as HTMLImageElement; renderer.draw(frame); expect(ctx.drawImage).not.toHaveBeenCalled();
    renderer.destroy(); ctx.clearRect.mockClear(); renderer.draw(frame); expect(ctx.clearRect).not.toHaveBeenCalled();
  });
});
