import type Phaser from 'phaser';
import type { Vec2 } from '../ecs/components';
import { crossesTownFootprint, townFacadePresentation, townPassageAlpha } from '../townPlaza';
import { TOWN_FACADES } from './townFacadeData';

// Original, untrimmed source PNGs. Contacts are measured source pixels, not a
// generic bottom pivot. Historical sources are retained byte-for-byte.
export const TOWN_CORNER_ASSETS = {
  cobble: { key: 'town_corner_cobble_source_v1', url: '/games/arpg/town-corner-v1/town-cobble-floor.png' },
  shop: { key: 'town_corner_shop_v1', url: '/games/arpg/town-corner-v1/town-corner-shop.png' },
  lantern: { key: 'town_corner_lantern_v1', url: '/games/arpg/town-corner-v1/town-lantern-plinth.png' }
} as const;
// The archived cobble diamond is intentionally not queued by the live scene.
// Its original file and painter remain available for historical evidence.
export const TOWN_RUNTIME_ASSETS = {
  shop: TOWN_CORNER_ASSETS.shop,
  lantern: TOWN_CORNER_ASSETS.lantern,
  ground: { key: 'town_cobble_material_v1', url: '/games/arpg/town-plaza-v1/town-worn-paving-material-v2.png' },
  ...Object.fromEntries(TOWN_FACADES.flatMap(facade => Object.entries(facade.layers).map(([layer, asset]) => [`${facade.id}-${layer}`, asset]))),
  entrance: { key: 'town_ruins_entrance_v1', url: '/games/arpg/town-ground-v1/town-ruins-entrance-v1.png' }
} as const;
export const TOWN_COBBLE_PATCH_KEY = 'town_corner_cobble_patch_v1';
export const TOWN_GROUND_KEY = 'town_ground_plane_v1';
export const TOWN_MATERIAL_KEY = 'town_ground_mirrored_material_v1';
export const TOWN_GROUND_RESOLUTION = 0.5;
// 128px source quadrants span four logical cells. The doubled cobble scale
// avoids dense speckle while keeping the temporary material size unchanged.
export const TOWN_MATERIAL_CELL_PIXELS = 32;
export const TOWN_MATERIAL_SIZE = 256;
export const TOWN_CORNER_LAYOUT = {
  // Relative to spawn (14,9), the shop's body sits above/right. Its front
  // foundation is slightly lower, leaving the roof on screen and HUD to the left.
  shopTile: { x: 16, y: 8 },
  lanternTile: { x: 15, y: 8.5 },
  floorTile: { x: 15.5, y: 7.5 },
  floorSize: { width: 512, height: 256 },
  floorSourceFrame: { x: 64, y: 162, width: 1408, height: 768 },
  shopOrigin: { x: 618 / 1254, y: 1175 / 1254 },
  shopScale: 256 / 1254,
  lanternOrigin: { x: 606 / 1199, y: 1174 / 1312 },
  lanternScale: 80 / 1312,
  entranceTile: { x: 18, y: 9 },
  // The open passage threshold, not the lower right pillar's alpha extremum.
  entranceOrigin: { x: 666 / 1536, y: 826 / 1024 },
  entranceScale: 110 / 780,
  entranceLabelOffsetY: 40,
  // Only the foundation blocks movement; the tall roof is not a collider.
  shopFootprint: [{ x: -106, y: -44 }, { x: -1, y: -94 }, { x: 105, y: -51 }, { x: 0, y: 0 }]
} as const;

/** Single patch only. It is not seamless tile art. Output geometry is exact 2:1. */
export function paintTownCobble(context: CanvasRenderingContext2D, source: CanvasImageSource) {
  const { width, height } = TOWN_CORNER_LAYOUT.floorSize;
  const frame = TOWN_CORNER_LAYOUT.floorSourceFrame;
  context.save();
  try {
    context.clearRect(0, 0, width, height);
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width, height / 2);
    context.lineTo(width / 2, height);
    context.lineTo(0, height / 2);
    context.closePath();
    context.clip();
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
  } finally {
    context.restore();
  }
}

/** Preserve the exact interior cell edges; this surface never adds a collider. */
export function townGroundLayout(isoToWorld: (tx: number, ty: number) => Vec2, columns = 28, rows = 18) {
  if (columns < 3 || rows < 3) throw new Error('Town ground needs an interior.');
  const corners = [isoToWorld(0.5, 0.5), isoToWorld(columns - 1.5, 0.5),
    isoToWorld(columns - 1.5, rows - 1.5), isoToWorld(0.5, rows - 1.5)];
  const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
  const width = Math.max(...corners.map(point => point.x)) - x;
  const height = Math.max(...corners.map(point => point.y)) - y;
  return { x, y, width, height, corners, columns, rows,
    pixelWidth: Math.ceil(width * TOWN_GROUND_RESOLUTION), pixelHeight: Math.ceil(height * TOWN_GROUND_RESOLUTION),
    origin: isoToWorld(0, 0), xAxis: isoToWorld(1, 0), yAxis: isoToWorld(0, 1) };
}

/** Explicit mirror addressing, not a claim that the source has periodic edges. */
export function paintTownMaterial(context: CanvasRenderingContext2D, source: CanvasImageSource) {
  const half = TOWN_MATERIAL_SIZE / 2;
  context.save();
  try {
    // Phaser's global pixelArt setting disables pooled-canvas smoothing. This
    // painterly material needs filtered downsampling; restore the caller state.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, TOWN_MATERIAL_SIZE, TOWN_MATERIAL_SIZE);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      context.save();
      try {
        context.translate(x ? TOWN_MATERIAL_SIZE : 0, y ? TOWN_MATERIAL_SIZE : 0);
        context.scale(x ? -1 : 1, y ? -1 : 1);
        context.drawImage(source, 0, 0, half, half);
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
}

/** One pattern fill avoids separately antialiasing every tilted tile boundary. */
export function paintTownGround(context: CanvasRenderingContext2D, material: CanvasImageSource,
  layout: ReturnType<typeof townGroundLayout>) {
  const pattern = context.createPattern(material, 'repeat');
  if (!pattern) throw new Error('Town material pattern could not be created.');
  const resolution = TOWN_GROUND_RESOLUTION;
  context.save();
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, layout.pixelWidth, layout.pixelHeight);
    context.beginPath();
    layout.corners.forEach((point, index) => {
      const x = (point.x - layout.x) * resolution, y = (point.y - layout.y) * resolution;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.clip();
    context.translate((layout.origin.x - layout.x) * resolution, (layout.origin.y - layout.y) * resolution);
    const ratio = resolution / TOWN_MATERIAL_CELL_PIXELS;
    context.transform((layout.xAxis.x - layout.origin.x) * ratio, (layout.xAxis.y - layout.origin.y) * ratio,
      (layout.yAxis.x - layout.origin.x) * ratio, (layout.yAxis.y - layout.origin.y) * ratio, 0, 0);
    context.fillStyle = pattern;
    context.fillRect(0, 0, layout.columns * TOWN_MATERIAL_CELL_PIXELS, layout.rows * TOWN_MATERIAL_CELL_PIXELS);
  } finally {
    context.restore();
  }
}

// Local composition proof only: floor shading anchored to existing physical
// contacts. No new architecture, sprites, collider or texture allocation.
export const TOWN_LIGHTING_PROOF = {
  warmPools: [
    { tile: { x: 15, y: 8.5 }, offset: { x: 0, y: 0 }, radius: { x: 104, y: 56 } },
    { tile: { x: 18, y: 9 }, offset: { x: -26, y: -2 }, radius: { x: 74, y: 40 } }
  ],
  coolContacts: [
    { tile: { x: 16, y: 8 }, offset: { x: -12, y: -42 }, radius: { x: 156, y: 75 } },
    { tile: { x: 18, y: 9 }, offset: { x: 20, y: 7 }, radius: { x: 95, y: 37 } },
    { tile: { x: 15, y: 8.5 }, offset: { x: 2, y: 2 }, radius: { x: 23, y: 10 } }
  ]
} as const;

/** Bounded local light pools; unshaded paving retains its source midtones. */
export function paintTownLighting(context: CanvasRenderingContext2D,
  layout: ReturnType<typeof townGroundLayout>, isoToWorld: (tx: number, ty: number) => Vec2) {
  const resolution = TOWN_GROUND_RESOLUTION;
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.beginPath();
    layout.corners.forEach((point, index) => {
      const x = (point.x - layout.x) * resolution, y = (point.y - layout.y) * resolution;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath(); context.clip();
    const pool = (entry: typeof TOWN_LIGHTING_PROOF.warmPools[number] | typeof TOWN_LIGHTING_PROOF.coolContacts[number], warm: boolean) => {
      const point = isoToWorld(entry.tile.x, entry.tile.y);
      context.save();
      try {
        context.translate((point.x + entry.offset.x - layout.x) * resolution, (point.y + entry.offset.y - layout.y) * resolution);
        context.scale(entry.radius.x * resolution, entry.radius.y * resolution);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, warm ? 'rgba(242,177,83,0.18)' : 'rgba(18,30,47,0.30)');
        gradient.addColorStop(0.55, warm ? 'rgba(242,177,83,0.07)' : 'rgba(18,30,47,0.12)');
        gradient.addColorStop(1, warm ? 'rgba(242,177,83,0)' : 'rgba(18,30,47,0)');
        context.fillStyle = gradient;
        context.fillRect(-1, -1, 2, 2);
      } finally { context.restore(); }
    };
    for (const contact of TOWN_LIGHTING_PROOF.coolContacts) pool(contact, false);
    for (const light of TOWN_LIGHTING_PROOF.warmPools) pool(light, true);
  } finally { context.restore(); }
}

/** The original shop and new exact-grid façades share the swept-circle test. */
export function crossesTownShop(from: Vec2, to: Vec2, radius: number, shopContact: Vec2) {
  return crossesTownFootprint(from, to, radius, TOWN_CORNER_LAYOUT.shopFootprint.map(point => ({ x: point.x + shopContact.x, y: point.y + shopContact.y })));
}

export type TownCorner = {
  blocksMovement(from: Vec2, to: Vec2, radius: number): boolean;
  updateActor(actor: Vec2): void;
  destroy(): void;
};

/** Area-owned objects and derived ground; source textures remain game-owned. */
export function createTownCorner(
  scene: Phaser.Scene,
  addToWorld: (image: Phaser.GameObjects.Image) => void,
  isoToWorld: (tx: number, ty: number) => Vec2,
  floorDepth: number
): TownCorner {
  const images: Phaser.GameObjects.Image[] = [];
  const shop = isoToWorld(TOWN_CORNER_LAYOUT.shopTile.x, TOWN_CORNER_LAYOUT.shopTile.y);
  const ownedTextures = new Set<string>();
  let destroyed = false;
  const releaseTexture = (key: string) => {
    if (!ownedTextures.delete(key)) return;
    scene.textures.remove(key);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const image of images) image.destroy();
    images.length = 0;
    for (const key of ownedTextures) releaseTexture(key);
  };
  try {
    const canvas = (key: string, width: number, height: number) => {
      if (scene.textures.exists(key)) throw new Error('Town ground texture already exists.');
      const texture = scene.textures.createCanvas(key, width, height);
      if (!texture) throw new Error('Town ground canvas could not be created.');
      ownedTextures.add(key);
      return texture;
    };
    const layout = townGroundLayout(isoToWorld);
    const ground = canvas(TOWN_GROUND_KEY, layout.pixelWidth, layout.pixelHeight);
    // The temporary mirror material is only 256². It is released after the
    // single ground rasterization; no full-resolution mirrored atlas is kept.
    const material = canvas(TOWN_MATERIAL_KEY, TOWN_MATERIAL_SIZE, TOWN_MATERIAL_SIZE);
    paintTownMaterial(material.context, scene.textures.get(TOWN_RUNTIME_ASSETS.ground.key).getSourceImage() as CanvasImageSource);
    paintTownGround(ground.context, material.canvas, layout);
    paintTownLighting(ground.context, layout, isoToWorld);
    releaseTexture(TOWN_MATERIAL_KEY);
    ground.refresh();
    // Phaser.Textures.FilterMode.LINEAR = 0. Keep global pixelArt and every
    // source/actor texture untouched; only this generated ground is filtered.
    ground.setFilter(0);
    const add = (position: Vec2, key: string) => {
      const image = scene.add.image(position.x, position.y, key);
      images.push(image);
      addToWorld(image);
      return image;
    };
    // Top of the original negative floor band, below every actor and wall.
    add(layout, TOWN_GROUND_KEY).setOrigin(0, 0).setScale(1 / TOWN_GROUND_RESOLUTION).setDepth(floorDepth);
    const shopImage = add(shop, TOWN_CORNER_ASSETS.shop.key).setName('town-plaza-shop')
      .setOrigin(TOWN_CORNER_LAYOUT.shopOrigin.x, TOWN_CORNER_LAYOUT.shopOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.shopScale).setDepth(shop.y + 20);
    const lantern = isoToWorld(TOWN_CORNER_LAYOUT.lanternTile.x, TOWN_CORNER_LAYOUT.lanternTile.y);
    add(lantern, TOWN_CORNER_ASSETS.lantern.key)
      .setOrigin(TOWN_CORNER_LAYOUT.lanternOrigin.x, TOWN_CORNER_LAYOUT.lanternOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.lanternScale).setDepth(lantern.y + 20);
    const entrance = isoToWorld(TOWN_CORNER_LAYOUT.entranceTile.x, TOWN_CORNER_LAYOUT.entranceTile.y);
    const entranceImage = add(entrance, TOWN_RUNTIME_ASSETS.entrance.key)
      .setOrigin(TOWN_CORNER_LAYOUT.entranceOrigin.x, TOWN_CORNER_LAYOUT.entranceOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.entranceScale).setDepth(entrance.y + 20);
    const facades = TOWN_FACADES.map(facade => {
      const layers = Object.entries(facade.layers).map(([layer, asset]) => ({ layer,
        image: add(facade.contact, asset.key).setName(`town-plaza-${facade.id}-${layer}`)
          .setOrigin(asset.originX, asset.originY).setScale(asset.scale).setDepth(facade.contact.y + 20)
      }));
      const polygon = facade.footprint.map(point => ({ x: point.x + facade.contact.x, y: point.y + facade.contact.y }));
      return { facade, layers, polygon };
    });
    // Existing raster stays byte-identical. Its full source rectangle is a
    // conservative cutaway trigger; it is never substituted for its collider.
    const shopLeft = -618 * TOWN_CORNER_LAYOUT.shopScale;
    const shopTop = -1175 * TOWN_CORNER_LAYOUT.shopScale;
    const shopArt = [[{ x: shopLeft, y: shopTop }, { x: shopLeft + 256, y: shopTop },
      { x: shopLeft + 256, y: shopTop + 256 }, { x: shopLeft, y: shopTop + 256 }]];
    return {
      blocksMovement: (from, to, radius) => !destroyed && (crossesTownShop(from, to, radius, shop) ||
        facades.some(({ polygon }) => crossesTownFootprint(from, to, radius, polygon))),
      updateActor: actor => {
        if (destroyed) return;
        const shopState = townFacadePresentation(actor, shop, TOWN_CORNER_LAYOUT.shopFootprint, shopArt);
        shopImage.setDepth(shopState.depth).setAlpha(shopState.alpha);
        entranceImage.setAlpha(townPassageAlpha(actor, entrance));
        for (const { facade, layers } of facades) {
          const state = townFacadePresentation(actor, facade.contact, facade.footprint, facade.upperPolygons);
          for (const { image, layer } of layers) image.setDepth(state.depth).setAlpha(layer === 'upper' ? state.alpha : 1);
        }
      },
      destroy
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
