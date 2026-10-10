import type Phaser from 'phaser';
import type { Vec2 } from '../ecs/components';

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
  ground: { key: 'town_cobble_material_v1', url: '/games/arpg/town-ground-v1/town-cobble-material-v1.png' },
  entrance: { key: 'town_ruins_entrance_v1', url: '/games/arpg/town-ground-v1/town-ruins-entrance-v1.png' }
} as const;
export const TOWN_COBBLE_PATCH_KEY = 'town_corner_cobble_patch_v1';
export const TOWN_GROUND_KEY = 'town_ground_plane_v1';
export const TOWN_MATERIAL_KEY = 'town_ground_mirrored_material_v1';
export const TOWN_GROUND_RESOLUTION = 0.5;
export const TOWN_MATERIAL_CELL_PIXELS = 64;
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
}

/** One pattern fill avoids separately antialiasing every tilted tile boundary. */
export function paintTownGround(context: CanvasRenderingContext2D, material: CanvasImageSource,
  layout: ReturnType<typeof townGroundLayout>) {
  const pattern = context.createPattern(material, 'repeat');
  if (!pattern) throw new Error('Town material pattern could not be created.');
  const resolution = TOWN_GROUND_RESOLUTION;
  context.save();
  try {
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
    releaseTexture(TOWN_MATERIAL_KEY);
    ground.refresh();
    const add = (position: Vec2, key: string) => {
      const image = scene.add.image(position.x, position.y, key);
      images.push(image);
      addToWorld(image);
      return image;
    };
    // Top of the original negative floor band, below every actor and wall.
    add(layout, TOWN_GROUND_KEY).setOrigin(0, 0).setScale(1 / TOWN_GROUND_RESOLUTION).setDepth(floorDepth);
    add(shop, TOWN_CORNER_ASSETS.shop.key)
      .setOrigin(TOWN_CORNER_LAYOUT.shopOrigin.x, TOWN_CORNER_LAYOUT.shopOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.shopScale).setDepth(shop.y + 20);
    const lantern = isoToWorld(TOWN_CORNER_LAYOUT.lanternTile.x, TOWN_CORNER_LAYOUT.lanternTile.y);
    add(lantern, TOWN_CORNER_ASSETS.lantern.key)
      .setOrigin(TOWN_CORNER_LAYOUT.lanternOrigin.x, TOWN_CORNER_LAYOUT.lanternOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.lanternScale).setDepth(lantern.y + 20);
    const entrance = isoToWorld(TOWN_CORNER_LAYOUT.entranceTile.x, TOWN_CORNER_LAYOUT.entranceTile.y);
    add(entrance, TOWN_RUNTIME_ASSETS.entrance.key)
      .setOrigin(TOWN_CORNER_LAYOUT.entranceOrigin.x, TOWN_CORNER_LAYOUT.entranceOrigin.y)
      .setScale(TOWN_CORNER_LAYOUT.entranceScale).setDepth(entrance.y + 20);
    return { blocksMovement: (from, to, radius) => !destroyed && crossesTownShop(from, to, radius, shop), destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
