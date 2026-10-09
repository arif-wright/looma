import type Phaser from 'phaser';
import type { Vec2 } from '../ecs/components';

// Original, untrimmed source PNGs. Contacts are measured source pixels, not a
// generic bottom pivot. These three stills are the entire local art slice.
export const TOWN_CORNER_ASSETS = {
  cobble: { key: 'town_corner_cobble_source_v1', url: '/games/arpg/town-corner-v1/town-cobble-floor.png' },
  shop: { key: 'town_corner_shop_v1', url: '/games/arpg/town-corner-v1/town-corner-shop.png' },
  lantern: { key: 'town_corner_lantern_v1', url: '/games/arpg/town-corner-v1/town-lantern-plinth.png' }
} as const;
export const TOWN_COBBLE_PATCH_KEY = 'town_corner_cobble_patch_v1';
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

function pointSegmentDistanceSquared(point: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}
const cross = (a: Vec2, b: Vec2, p: Vec2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  // Inclusive bounds also distinguish disjoint collinear segments.
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
      Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
function insideConvex(point: Vec2, polygon: readonly Vec2[]) {
  const sides = polygon.map((a, i) => cross(a, polygon[(i + 1) % polygon.length]!, point));
  return sides.every(value => value >= 0) || sides.every(value => value <= 0);
}

/** Swept actor circle, so both ordinary movement and a 230px dash are blocked. */
export function crossesTownShop(from: Vec2, to: Vec2, radius: number, shopContact: Vec2) {
  const polygon = TOWN_CORNER_LAYOUT.shopFootprint.map(point => ({ x: point.x + shopContact.x, y: point.y + shopContact.y }));
  if (insideConvex(from, polygon) || insideConvex(to, polygon)) return true;
  const radiusSquared = Math.max(0, radius) ** 2;
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    return segmentsIntersect(from, to, a, b) || Math.min(
      pointSegmentDistanceSquared(from, a, b), pointSegmentDistanceSquared(to, a, b),
      pointSegmentDistanceSquared(a, from, to), pointSegmentDistanceSquared(b, from, to)
    ) <= radiusSquared;
  });
}

export type TownCorner = {
  blocksMovement(from: Vec2, to: Vec2, radius: number): boolean;
  destroy(): void;
};

/** Area-owned objects and derived texture; source textures remain game-owned. */
export function createTownCorner(
  scene: Phaser.Scene,
  addToWorld: (image: Phaser.GameObjects.Image) => void,
  isoToWorld: (tx: number, ty: number) => Vec2,
  floorDepth: number
): TownCorner {
  const images: Phaser.GameObjects.Image[] = [];
  const shop = isoToWorld(TOWN_CORNER_LAYOUT.shopTile.x, TOWN_CORNER_LAYOUT.shopTile.y);
  let ownsTexture = false;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const image of images) image.destroy();
    images.length = 0;
    if (ownsTexture) scene.textures.remove(TOWN_COBBLE_PATCH_KEY);
  };
  try {
    // Never overwrite somebody else's texture. Each area must release its own.
    if (scene.textures.exists(TOWN_COBBLE_PATCH_KEY)) throw new Error('Town cobble texture already exists.');
    const { width, height } = TOWN_CORNER_LAYOUT.floorSize;
    const patch = scene.textures.createCanvas(TOWN_COBBLE_PATCH_KEY, width, height);
    if (!patch) throw new Error('Town cobble canvas could not be created.');
    ownsTexture = true;
    paintTownCobble(patch.context, scene.textures.get(TOWN_CORNER_ASSETS.cobble.key).getSourceImage() as CanvasImageSource);
    patch.refresh();
    const add = (position: Vec2, key: string) => {
      const image = scene.add.image(position.x, position.y, key);
      images.push(image);
      addToWorld(image);
      return image;
    };
    const floor = isoToWorld(TOWN_CORNER_LAYOUT.floorTile.x, TOWN_CORNER_LAYOUT.floorTile.y);
    // Top of the existing negative floor band, above overlapping base floor
    // PNGs but below every actor/marker/wall. No room or camera changes.
    add(floor, TOWN_COBBLE_PATCH_KEY).setOrigin(0.5).setDepth(floorDepth);
    add(shop, TOWN_CORNER_ASSETS.shop.key)
      .setOrigin(TOWN_CORNER_LAYOUT.shopOrigin.x, TOWN_CORNER_LAYOUT.shopOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.shopScale).setDepth(shop.y + 20);
    const lantern = isoToWorld(TOWN_CORNER_LAYOUT.lanternTile.x, TOWN_CORNER_LAYOUT.lanternTile.y);
    add(lantern, TOWN_CORNER_ASSETS.lantern.key)
      .setOrigin(TOWN_CORNER_LAYOUT.lanternOrigin.x, TOWN_CORNER_LAYOUT.lanternOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.lanternScale).setDepth(lantern.y + 20);
    return { blocksMovement: (from, to, radius) => !destroyed && crossesTownShop(from, to, radius, shop), destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
