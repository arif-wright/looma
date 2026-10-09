import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createTownCorner, crossesTownShop, paintTownCobble, TOWN_CORNER_ASSETS, TOWN_COBBLE_PATCH_KEY, TOWN_CORNER_LAYOUT } from '../games/arpg/assets/townCorner';

const iso = (x: number, y: number) => ({ x: (x - y) * 64 + 1152, y: (x + y) * 32 - 200 });
const make = () => {
  const source = {};
  const context = {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(), drawImage: vi.fn()
  };
  const keys = new Set<string>();
  const images: any[] = [];
  const texture = { context, refresh: vi.fn() };
  const scene: any = {
    textures: {
      exists: (key: string) => keys.has(key),
      get: vi.fn(() => ({ getSourceImage: () => source })),
      createCanvas: vi.fn((key: string) => { keys.add(key); return texture; }),
      remove: vi.fn((key: string) => keys.delete(key))
    },
    add: { image: vi.fn((x: number, y: number, key: string) => {
      const image: any = { x, y, key, destroy: vi.fn() };
      for (const method of ['setOrigin', 'setScale', 'setDepth']) image[method] = vi.fn(() => image);
      images.push(image); return image;
    }) }
  };
  return { scene, images, texture, context, source, keys, add: vi.fn() };
};

describe('original town-corner art contract (renderer mocked)', () => {
  it('clips the measured source frame into exactly one 512x256 diamond', () => {
    const { context, source } = make();
    paintTownCobble(context as any, source as any);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 512, 256);
    expect(context.moveTo).toHaveBeenCalledWith(256, 0);
    expect(context.lineTo.mock.calls).toEqual([[512, 128], [256, 256], [0, 128]]);
    expect(context.closePath).toHaveBeenCalledOnce(); expect(context.clip).toHaveBeenCalledOnce();
    expect(context.drawImage.mock.calls).toEqual([[source, 64, 162, 1408, 768, 0, 0, 512, 256]]);
    expect(context.clip.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]!);
    expect(context.save).toHaveBeenCalledOnce(); expect(context.restore).toHaveBeenCalledOnce();
  });

  it('adds only three area-owned images with measured full-source pivots and uniform scale', () => {
    const { scene, images, texture, add } = make();
    createTownCorner(scene, add, iso, -199);
    expect(scene.textures.createCanvas.mock.calls).toEqual([[TOWN_COBBLE_PATCH_KEY, 512, 256]]);
    expect(texture.refresh).toHaveBeenCalledOnce(); expect(add).toHaveBeenCalledTimes(3);
    expect(images.map(image => image.key)).toEqual([TOWN_COBBLE_PATCH_KEY, TOWN_CORNER_ASSETS.shop.key, TOWN_CORNER_ASSETS.lantern.key]);
    expect(images[0].setDepth).toHaveBeenCalledWith(-199);
    expect(images[1]).toMatchObject(iso(16, 8));
    expect(images[1].setOrigin).toHaveBeenCalledWith(618 / 1254, 1175 / 1254);
    expect(images[1].setScale).toHaveBeenCalledWith(256 / 1254);
    expect(images[1].setDepth).toHaveBeenCalledWith(588);
    expect(images[2].setOrigin).toHaveBeenCalledWith(606 / 1199, 1174 / 1312);
    expect(images[2].setScale).toHaveBeenCalledWith(80 / 1312);
    expect(images[2].setDepth).toHaveBeenCalledWith(572);
  });

  it('destroys area objects and its derived texture once, retaining game-owned sources', () => {
    const { scene, images, add } = make();
    const corner = createTownCorner(scene, add, iso, -199);
    corner.destroy(); corner.destroy();
    expect(images.every(image => image.destroy.mock.calls.length === 1)).toBe(true);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_COBBLE_PATCH_KEY]]);
    expect(corner.blocksMovement(iso(16, 8), iso(16, 8), 38)).toBe(false);
    const next = createTownCorner(scene, add, iso, -199);
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(2);
    next.destroy();
    expect(scene.textures.remove).toHaveBeenCalledTimes(2);
  });

  it('cleans a partially created canvas on painting failure and restores the canvas state', () => {
    const { scene, context, add } = make();
    context.drawImage.mockImplementation(() => { throw new Error('paint failed'); });
    expect(() => createTownCorner(scene, add, iso, -199)).toThrow('paint failed');
    expect(context.restore).toHaveBeenCalledOnce();
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_COBBLE_PATCH_KEY]]);
    expect(add).not.toHaveBeenCalled();
  });

  it('destroys partially created images if world insertion fails', () => {
    const { scene, images } = make();
    expect(() => createTownCorner(scene, () => { throw new Error('layer failed'); }, iso, -199)).toThrow('layer failed');
    expect(images).toHaveLength(1); expect(images[0].destroy).toHaveBeenCalledOnce();
    expect(scene.textures.remove).toHaveBeenCalledWith(TOWN_COBBLE_PATCH_KEY);
  });

  it('never replaces or removes a generated texture owned by another instance', () => {
    const { scene, keys, add } = make(); keys.add(TOWN_COBBLE_PATCH_KEY);
    expect(() => createTownCorner(scene, add, iso, -199)).toThrow('already exists');
    expect(scene.textures.createCanvas).not.toHaveBeenCalled();
    expect(scene.textures.remove).not.toHaveBeenCalled();
  });

  it('fails explicitly if a CanvasTexture cannot be allocated', () => {
    const { scene, add } = make(); scene.textures.createCanvas.mockReturnValue(null);
    expect(() => createTownCorner(scene, add, iso, -199)).toThrow('could not be created');
    expect(scene.textures.remove).not.toHaveBeenCalled();
  });

  it('blocks the narrow foundation rather than the full roof rectangle', () => {
    const contact = iso(16, 8);
    expect(crossesTownShop(contact, contact, 0, contact)).toBe(true);
    const center = { x: contact.x, y: contact.y - 45 };
    expect(crossesTownShop(center, center, 0, contact)).toBe(true);
    const roof = { x: contact.x, y: contact.y - 180 };
    expect(crossesTownShop(roof, roof, 38, contact)).toBe(false);
    const side = { x: contact.x + 150, y: contact.y - 45 };
    expect(crossesTownShop(side, side, 38, contact)).toBe(false);
  });

  it('blocks swept dashes even when both endpoints are outside the foundation', () => {
    const contact = iso(16, 8);
    const from = { x: contact.x - 160, y: contact.y - 47 };
    const to = { x: contact.x + 160, y: contact.y - 47 };
    expect(crossesTownShop(from, from, 38, contact)).toBe(false);
    expect(crossesTownShop(to, to, 38, contact)).toBe(false);
    expect(crossesTownShop(from, to, 38, contact)).toBe(true);
    expect(crossesTownShop(to, from, 38, contact)).toBe(true);
  });

  it('keeps the spawn, gate and their straight walking/dash corridor open', () => {
    const shop = iso(TOWN_CORNER_LAYOUT.shopTile.x, TOWN_CORNER_LAYOUT.shopTile.y);
    const spawn = iso(14, 9), gate = iso(18, 9);
    expect(crossesTownShop(spawn, spawn, 38, shop)).toBe(false);
    expect(crossesTownShop(gate, gate, 38, shop)).toBe(false);
    expect(crossesTownShop(spawn, gate, 38, shop)).toBe(false);
    expect(crossesTownShop(gate, spawn, 38, shop)).toBe(false);
  });

  it.each([
    ['cobble', 1536, 1024, 'ad397a376a97fb4cf4b522754d90a3c233b1c1b6dba93bcd34b9db9181a7cdd1'],
    ['shop', 1254, 1254, '8adc22a6d083154e0e44085359dcdf546008f3e9dd257cc65789e1a4967bb243'],
    ['lantern', 1199, 1312, '3dfa89b28f778ac5ba80af672539394bfc65839b27f54d7ca45dc70b2b6d81bf']
  ] as const)('keeps the original %s source bytes and dimensions unchanged', (name, width, height, sha256) => {
    const bytes = readFileSync(`static${TOWN_CORNER_ASSETS[name].url}`);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
  });
});
