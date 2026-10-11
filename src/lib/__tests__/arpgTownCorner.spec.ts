import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TOWN_FACADES } from '../games/arpg/assets/townFacadeData';
import { createTownCorner, crossesTownShop, paintTownCobble, paintTownMaterial, paintTownGround, paintTownLighting, TOWN_LIGHTING_PROOF, townGroundLayout, TOWN_CORNER_ASSETS, TOWN_RUNTIME_ASSETS, TOWN_GROUND_KEY, TOWN_MATERIAL_KEY, TOWN_CORNER_LAYOUT } from '../games/arpg/assets/townCorner';

const iso = (x: number, y: number) => ({ x: (x - y) * 64 + 1152, y: (x + y) * 32 - 200 });
const make = () => {
  const source = {};
  const context = () => {
    const value = {
      save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), fill: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(256 * 256 * 4).fill(255) })),
      createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })), putImageData: vi.fn(),
      translate: vi.fn(), scale: vi.fn(), transform: vi.fn(), fillRect: vi.fn(),
      createPattern: vi.fn(() => ({})), createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })), fillStyle: null as any,
      globalAlpha: 0.7, globalCompositeOperation: 'multiply' as GlobalCompositeOperation,
      imageSmoothingEnabled: false, imageSmoothingQuality: 'low' as ImageSmoothingQuality
    };
    const stack: Array<[boolean, ImageSmoothingQuality, number, GlobalCompositeOperation, any]> = [];
    value.save.mockImplementation(() => { stack.push([value.imageSmoothingEnabled, value.imageSmoothingQuality, value.globalAlpha, value.globalCompositeOperation, value.fillStyle]); });
    value.restore.mockImplementation(() => {
      const previous = stack.pop();
      if (previous) [value.imageSmoothingEnabled, value.imageSmoothingQuality, value.globalAlpha, value.globalCompositeOperation, value.fillStyle] = previous;
    });
    return value;
  };
  const keys = new Set<string>();
  const images: any[] = [];
  const boundaries: any[] = [];
  const ground = { context: context(), refresh: vi.fn(), setFilter: vi.fn(), canvas: {} };
  const material = { context: context(), setSize: vi.fn(), refresh: vi.fn(), setFilter: vi.fn(), canvas: {} };
  const scene: any = {
    textures: {
      exists: (key: string) => keys.has(key),
      get: vi.fn(() => ({ getSourceImage: () => source })),
      createCanvas: vi.fn((key: string) => { keys.add(key); return key === TOWN_MATERIAL_KEY ? material : ground; }),
      remove: vi.fn((key: string) => keys.delete(key))
    },
    add: { graphics: vi.fn(() => {
      const graphic: any = { destroy: vi.fn() };
      for (const method of ['setName', 'setDepth', 'fillStyle', 'fillPoints']) graphic[method] = vi.fn(() => graphic);
      boundaries.push(graphic); return graphic;
    }), image: vi.fn((x: number, y: number, key: string) => {
      const image: any = { x, y, key, destroy: vi.fn() };
      for (const method of ['setOrigin', 'setScale', 'setDepth', 'setName', 'setAlpha']) image[method] = vi.fn(() => image);
      images.push(image); return image;
    }) }
  };
  return { scene, images, boundaries, ground, material, context: ground.context, source, keys, add: vi.fn() };
};

describe('town ground and retained original art contract (renderer mocked)', () => {
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

  it('clips the continuous plane to exact walkable interior edges', () => {
    const layout = townGroundLayout(iso);
    expect(layout).toMatchObject({ x: 128, y: -168, width: 2688, height: 1344, pixelWidth: 1344, pixelHeight: 672 });
    expect(layout.corners).toEqual([iso(0.5, 0.5), iso(26.5, 0.5), iso(26.5, 16.5), iso(0.5, 16.5)]);
    const { context, material } = make();
    paintTownGround(context as any, material.canvas as any, layout);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1344, 672);
    expect(context.moveTo).toHaveBeenCalledWith(512, 0);
    expect(context.lineTo.mock.calls).toEqual([[1344, 416], [832, 672], [0, 256]]);
    expect(context.createPattern).toHaveBeenCalledWith(material.canvas, 'no-repeat');
    expect(context.translate).toHaveBeenCalledWith(512, -16);
    expect(context.transform).toHaveBeenCalledWith(1, 0.5, -1, 0.5, 0, 0);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 896, 576);
    expect(context.clip.mock.invocationCallOrder[0]).toBeLessThan(context.fillRect.mock.invocationCallOrder[0]!);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('mirrors both source axes into one bounded material without editing source pixels', () => {
    const { context, source } = make();
    paintTownMaterial(context as any, source as any);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context.translate.mock.calls).toEqual([[0, 0], [256, 0], [0, 256], [256, 256]]);
    expect(context.scale.mock.calls).toEqual([[1, 1], [-1, 1], [1, -1], [-1, -1]]);
    expect(context.drawImage.mock.calls).toEqual(Array.from({ length: 4 }, () => [source, 0, 0, 128, 128]));
    expect(context.save).toHaveBeenCalledTimes(5); expect(context.restore).toHaveBeenCalledTimes(5);
    // The exact reflection above duplicates adjacent and wrapped edge samples.
    // This checks addressing, not browser interpolation or visual quality.
    const reflected = (pixel: number) => pixel < 128 ? pixel : 255 - pixel;
    expect(reflected(127)).toBe(reflected(128));
    expect(reflected(255)).toBe(reflected(0));
  });

  it.each([
    ['material', false], ['material', true], ['ground', false], ['ground', true]
  ] as const)('filters %s painting and restores inherited pixelArt canvas state (throws=%s)', (kind, throws) => {
    const { context, source } = make();
    const operation = kind === 'material' ? context.drawImage : context.fillRect;
    operation.mockImplementation(() => {
      expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.imageSmoothingQuality).toBe('high');
      if (throws) throw new Error('paint rejected');
    });
    const paint = () => kind === 'material'
      ? paintTownMaterial(context as any, source as any)
      : paintTownGround(context as any, source as any, townGroundLayout(iso));
    if (throws) expect(paint).toThrow('paint rejected'); else paint();
    expect(operation).toHaveBeenCalled();
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.imageSmoothingQuality).toBe('low');
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
  });

  it('bakes exactly two amber pools and three cool contacts inside the existing floor clip', () => {
    const { context } = make();
    const layout = townGroundLayout(iso);
    paintTownLighting(context as any, layout, iso);
    expect(TOWN_LIGHTING_PROOF.warmPools).toHaveLength(2);
    expect(TOWN_LIGHTING_PROOF.coolContacts).toHaveLength(3);
    expect(context.moveTo).toHaveBeenCalledWith(512, 0);
    expect(context.lineTo.mock.calls.slice(0, 3)).toEqual([[1344, 416], [832, 672], [0, 256]]);
    expect(context.fill).toHaveBeenCalledTimes(12);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(context.clip.mock.invocationCallOrder[0]).toBeLessThan(context.fillRect.mock.invocationCallOrder[0]!);
    expect(context.translate.mock.calls).toEqual([[762, 347], [810, 419.5], [721, 361], [720, 360], [787, 415]]);
    expect(context.scale.mock.calls).toEqual([[78, 37.5], [47.5, 18.5], [11.5, 5], [52, 28], [37, 20]]);
    expect(context.fillRect.mock.calls).toEqual(Array.from({ length: 5 }, () => [-1, -1, 2, 2]));
    expect(context.clearRect).not.toHaveBeenCalled(); // Existing paving outside pools is untouched.
    expect(context.createRadialGradient.mock.calls).toEqual(Array.from({ length: 5 }, () => [0, 0, 0, 0, 0, 1]));
    for (const [index, result] of context.createRadialGradient.mock.results.entries()) {
      expect(result.value.addColorStop.mock.calls).toEqual(index < 3
        ? [[0, 'rgba(18,30,47,0.30)'], [0.55, 'rgba(18,30,47,0.12)'], [1, 'rgba(18,30,47,0)']]
        : [[0, 'rgba(242,177,83,0.18)'], [0.55, 'rgba(242,177,83,0.07)'], [1, 'rgba(242,177,83,0)']]);
    }
    expect(context.save).toHaveBeenCalledTimes(6);
    expect(context.restore).toHaveBeenCalledTimes(6);
    expect([context.globalAlpha, context.globalCompositeOperation, context.fillStyle]).toEqual([0.7, 'multiply', null]);
  });

  it.each(['gradient', 'fill'] as const)('restores every canvas state when lighting %s fails', (failure) => {
    const { context } = make();
    const reject = () => {
      expect(context.globalAlpha).toBe(1);
      expect(context.globalCompositeOperation).toBe('source-over');
      throw new Error('lighting failed');
    };
    if (failure === 'gradient') context.createRadialGradient.mockImplementation(reject);
    else context.fillRect.mockImplementation(reject);
    expect(() => paintTownLighting(context as any, townGroundLayout(iso), iso)).toThrow('lighting failed');
    expect(context.save).toHaveBeenCalledTimes(2); expect(context.restore).toHaveBeenCalledTimes(2);
    expect([context.globalAlpha, context.globalCompositeOperation, context.fillStyle]).toEqual([0.7, 'multiply', null]);
    expect([context.imageSmoothingEnabled, context.imageSmoothingQuality]).toEqual([false, 'low']);
  });

  it('rolls back both derived canvases when lighting fails before world insertion', () => {
    const { scene, context, add, keys, ground } = make();
    context.createRadialGradient.mockImplementation(() => { throw new Error('lighting unavailable'); });
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('lighting unavailable');
    expect(keys.size).toBe(0);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_GROUND_KEY], [TOWN_MATERIAL_KEY]]);
    expect(add).not.toHaveBeenCalled(); expect(ground.refresh).not.toHaveBeenCalled();
  });

  it('adds eight area-owned images with unchanged shop/lantern pivots and measured entrance threshold', () => {
    const { scene, images, ground, material, add } = make();
    createTownCorner(scene, add, iso, -161);
    expect(scene.textures.createCanvas.mock.calls).toEqual([[TOWN_GROUND_KEY, 1344, 672], [TOWN_MATERIAL_KEY, 256, 256]]);
    expect(ground.refresh).toHaveBeenCalledOnce(); expect(material.refresh).not.toHaveBeenCalled();
    expect(ground.setFilter.mock.calls).toEqual([[0]]); // LINEAR only for generated ground.
    expect(ground.refresh.mock.invocationCallOrder[0]).toBeLessThan(ground.setFilter.mock.invocationCallOrder[0]!);
    expect(material.setFilter).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(9);
    expect(images.map(image => image.key)).toEqual([TOWN_GROUND_KEY, TOWN_CORNER_ASSETS.shop.key, TOWN_CORNER_ASSETS.lantern.key, TOWN_RUNTIME_ASSETS.entrance.key, ...TOWN_FACADES.flatMap(facade => Object.values(facade.layers).map(layer => layer.key))]);
    expect(images[0]).toMatchObject({ x: 128, y: -168 });
    expect(images[0].setOrigin).toHaveBeenCalledWith(0, 0);
    expect(images[0].setScale).toHaveBeenCalledWith(2);
    expect(images[0].setDepth).toHaveBeenCalledWith(-161);
    expect(images[1]).toMatchObject(iso(16, 8));
    expect(images[1].setOrigin).toHaveBeenCalledWith(618 / 1254, 1175 / 1254);
    expect(images[1].setScale).toHaveBeenCalledWith(256 / 1254);
    expect(images[1].setDepth).toHaveBeenCalledWith(588);
    expect(images[2].setOrigin).toHaveBeenCalledWith(606 / 1199, 1174 / 1312);
    expect(images[2].setScale).toHaveBeenCalledWith(80 / 1312);
    expect(images[2].setDepth).toHaveBeenCalledWith(572);
    expect(images[3]).toMatchObject(iso(18, 9));
    expect(images[3].setOrigin).toHaveBeenCalledWith(666 / 1536, 826 / 1024);
    expect(images[3].setScale).toHaveBeenCalledWith(110 / 780);
    expect(images[3].setDepth).toHaveBeenCalledWith(684);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_MATERIAL_KEY]]);
  });

  it('owns one bounded below-actor perimeter and releases it once without rebuilding on updates', () => {
    const { scene, images, boundaries, material, add } = make();
    const corner = createTownCorner(scene, add, iso, -161);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].setName).toHaveBeenCalledWith('town-perimeter-rim');
    expect(boundaries[0].setDepth).toHaveBeenCalledWith(-160);
    expect(boundaries[0].fillPoints.mock.calls.length).toBeLessThan(120);
    expect(material.setSize).toHaveBeenCalledWith(896, 576);
    expect(material.context.putImageData).toHaveBeenCalledOnce();
    for (let i = 0; i < 20; i++) corner.updateActor({ x: 1472 + i, y: 536 });
    expect(material.context.putImageData).toHaveBeenCalledOnce();
    corner.destroy(); corner.destroy();
    expect(boundaries[0].destroy).toHaveBeenCalledOnce();
    expect(images.every(image => image.destroy.mock.calls.length === 1)).toBe(true);
    const next = createTownCorner(scene, add, iso, -161);
    expect(boundaries).toHaveLength(2);expect(boundaries[1]).not.toBe(boundaries[0]);
    next.destroy();expect(boundaries[1].destroy).toHaveBeenCalledOnce();
  });

  it.each(['getImageData', 'createImageData', 'putImageData'] as const)('rolls back derived textures when surface %s fails', (method) => {
    const { scene, material, keys, add } = make();
    material.context[method].mockImplementation(() => { throw new Error('surface allocation failed'); });
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('surface allocation failed');
    expect(keys.size).toBe(0);expect(add).not.toHaveBeenCalled();
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_GROUND_KEY], [TOWN_MATERIAL_KEY]]);
  });

  it('destroys the partial perimeter when world registration fails', () => {
    const { scene, boundaries, images, keys } = make();
    expect(() => createTownCorner(scene, () => {
      if (boundaries.length) throw new Error('boundary rejected');
    }, iso, -161)).toThrow('boundary rejected');
    expect(boundaries[0].destroy).toHaveBeenCalledOnce();
    expect(images[0].destroy).toHaveBeenCalledOnce();expect(keys.size).toBe(0);
  });

  it.each(['setName', 'setDepth', 'fillPoints'])('destroys the owned perimeter when %s fails', (method) => {
    const { scene, boundaries, images, keys, add } = make();
    const original = scene.add.graphics.getMockImplementation();
    scene.add.graphics.mockImplementation(() => {
      const graphic = original();
      graphic[method].mockImplementation(() => { throw new Error('boundary draw failed'); });
      return graphic;
    });
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('boundary draw failed');
    expect(boundaries[0].destroy).toHaveBeenCalledOnce();
    expect(images[0].destroy).toHaveBeenCalledOnce();expect(keys.size).toBe(0);
  });

  it('keeps foundation opaque while the real owned upper layer cuts away and recovers', () => {
    const { scene, images, add } = make();
    const corner = createTownCorner(scene, add, iso, -161);
    corner.updateActor({ x: 1368, y: 210 });
    expect(images[4].setAlpha).toHaveBeenLastCalledWith(1);
    expect(images[5].setAlpha).toHaveBeenLastCalledWith(0.28);
    expect(images[4].setName).toHaveBeenCalledWith('town-plaza-rear-foundation');
    expect(images[5].setName).toHaveBeenCalledWith('town-plaza-rear-upper');
    corner.updateActor({ x: 1680, y: 260 });
    expect(images[5].setAlpha).toHaveBeenLastCalledWith(1);
    expect(images[6].setAlpha).toHaveBeenLastCalledWith(1);
    expect(images[7].setAlpha).toHaveBeenLastCalledWith(0.28);
    corner.updateActor(iso(14, 9));
    expect(images[1].setDepth).toHaveBeenLastCalledWith(588);
    for (const image of images.slice(4)) expect(image.setAlpha).toHaveBeenLastCalledWith(1);
    corner.destroy();
    for (const image of images) image.setAlpha.mockClear();
    corner.updateActor({ x: 1368, y: 210 });
    expect(images.every(image => image.setAlpha.mock.calls.length === 0)).toBe(true);
  });

  it('fades the actual entrance at the hosted hidden-hero position, restores it, and never blocks passage', () => {
    const { scene, images, add } = make();
    const corner = createTownCorner(scene, add, iso, -161);
    const gate = images[3];
    for (const actor of [{ x: 1728.2249516406953, y: 662.9645570713918 }, iso(18, 9)]) {
      corner.updateActor(actor);
      expect(gate.setAlpha).toHaveBeenLastCalledWith(0.28);
      expect(gate.setDepth.mock.calls).toEqual([[684]]);
      expect(corner.blocksMovement(actor, actor, 38)).toBe(false);
    }
    expect(corner.blocksMovement({ x: 1728, y: 620 }, { x: 1728, y: 720 }, 38)).toBe(false);
    corner.updateActor({ x: 1728, y: 665 });
    expect(gate.setAlpha).toHaveBeenLastCalledWith(1);
    corner.updateActor(iso(14, 9));
    expect(gate.setAlpha).toHaveBeenLastCalledWith(1);
    corner.destroy(); gate.setAlpha.mockClear();
    corner.updateActor(iso(18, 9));
    expect(gate.setAlpha).not.toHaveBeenCalled();
    const returned = createTownCorner(scene, add, iso, -161);
    returned.updateActor(iso(14, 9));
    expect(images[11]).not.toBe(gate);
    expect(images[11].setAlpha).toHaveBeenLastCalledWith(1);
    expect(images[11].setDepth.mock.calls).toEqual([[684]]);
    returned.destroy();
  });

  it('cleans every partial facade allocation if world registration fails, without removing source textures', () => {
    const { scene, images, keys } = make();
    let registrations = 0;
    expect(() => createTownCorner(scene, () => { if (++registrations === 8) throw new Error('facade layer rejected'); }, iso, -161)).toThrow('facade layer rejected');
    expect(images).toHaveLength(7);
    expect(images.every(image => image.destroy.mock.calls.length === 1)).toBe(true);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_MATERIAL_KEY], [TOWN_GROUND_KEY]]);
    expect(keys.size).toBe(0);
  });

  it('destroys objects before their ground texture once and recreates only on reentry', () => {
    const { scene, images, add, keys } = make();
    const corner = createTownCorner(scene, add, iso, -161);
    expect(keys).toEqual(new Set([TOWN_GROUND_KEY]));
    corner.destroy(); corner.destroy();
    expect(images.every(image => image.destroy.mock.calls.length === 1)).toBe(true);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_MATERIAL_KEY], [TOWN_GROUND_KEY]]);
    expect(images[0].destroy.mock.invocationCallOrder[0]).toBeLessThan(scene.textures.remove.mock.invocationCallOrder[1]!);
    expect(corner.blocksMovement(iso(16, 8), iso(16, 8), 38)).toBe(false);
    const next = createTownCorner(scene, add, iso, -161);
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(4);
    next.destroy(); expect(keys.size).toBe(0);
  });

  it('cleans both canvases on source painting failure and restores material canvas state', () => {
    const { scene, material, add } = make();
    material.context.drawImage.mockImplementation(() => { throw new Error('paint failed'); });
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('paint failed');
    expect(material.context.restore).toHaveBeenCalledTimes(2);
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_GROUND_KEY], [TOWN_MATERIAL_KEY]]);
    expect(add).not.toHaveBeenCalled();
  });

  it('cleans both canvases if pattern creation fails', () => {
    const { scene, context, add } = make(); context.createPattern.mockReturnValue(null as any);
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('pattern could not be created');
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_GROUND_KEY], [TOWN_MATERIAL_KEY]]);
    expect(add).not.toHaveBeenCalled();
  });

  it('destroys partially created images if world insertion fails', () => {
    const { scene, images } = make();
    expect(() => createTownCorner(scene, () => { throw new Error('layer failed'); }, iso, -161)).toThrow('layer failed');
    expect(images).toHaveLength(1); expect(images[0].destroy).toHaveBeenCalledOnce();
    expect(scene.textures.remove.mock.calls).toEqual([[TOWN_MATERIAL_KEY], [TOWN_GROUND_KEY]]);
  });

  it.each([TOWN_GROUND_KEY, TOWN_MATERIAL_KEY])('never replaces or removes another owner texture %s', (key) => {
    const { scene, keys, add } = make(); keys.add(key);
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('already exists');
    expect(scene.textures.remove.mock.calls.map((args: [string]) => args[0])).not.toContain(key);
    expect(keys).toEqual(new Set([key]));
  });

  it.each([1, 2])('rolls back if canvas allocation %s fails', (allocation) => {
    const { scene, add, keys } = make();
    if (allocation === 1) scene.textures.createCanvas.mockReturnValueOnce(null);
    else scene.textures.createCanvas.mockImplementationOnce((key: string) => { keys.add(key); return make().ground; }).mockReturnValueOnce(null);
    expect(() => createTownCorner(scene, add, iso, -161)).toThrow('could not be created');
    expect(keys.size).toBe(0); expect(add).not.toHaveBeenCalled();
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
    ['ground', 1254, 1254, 'a6406fe5761ae2e01ccc5296e3c7622c0e0eeda9e2fc8a6e03ab66af0e886091'],
    ['entrance', 1536, 1024, '98ccc4b0ff921b241be233b07f9bcd09bc35d005ea8913483b4210ed302ed15d']
  ] as const)('uses original %s source bytes and dimensions unchanged', (name, width, height, sha256) => {
    const bytes = readFileSync(`static${TOWN_RUNTIME_ASSETS[name].url}`);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
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
