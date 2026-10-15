import type Phaser from 'phaser';
import type { Vec2 } from '../ecs/components';
import { crossesTownFootprint, townFacadePresentation } from '../townPlaza';

// Approved study D. These world-space endpoints are physical geometry, not
// decoration: the two open ends retain passages around the new courtyard bay.
export const TOWN_COURTYARD = {
  centerline: [{ x: 1184, y: 616 }, { x: 1728, y: 888 }, { x: 2016, y: 744 }],
  width: 16,
  height: 32,
  foundationHeight: 8
} as const;

type Face = { points: Vec2[]; color: number };
const raised = (point: Vec2, height: number): Vec2 => ({ x: point.x, y: point.y - height });

/** One shared definition for collision and every drawn ground-contact vertex.
 * The rectangles overlap at the elbow; neither is extended or miter-expanded.
 * Height is vertical screen/world y, retaining the existing 2:1 ground axes. */
export function townCourtyardGeometry() {
  const { centerline, width, height, foundationHeight } = TOWN_COURTYARD;
  return [0, 1].map(index => {
    const a = centerline[index]!, b = centerline[index + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length * width / 2;
    const ny = (b.x - a.x) / length * width / 2;
    const footprint = [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    const contact = a.y > b.y ? a : b;
    const local = (p: Vec2) => ({ x: p.x - contact.x, y: p.y - contact.y });
    // Only front-facing UNION boundary edges are visible. The shared end
    // faces intersect at contact: their internal halves are inside the other
    // approved rectangle and must not paint over its cap. Keep the exact butt
    // joint's concave notch; no miter fill or collision expansion is introduced.
    const exposed = index === 0
      ? [{ a: footprint[0]!, b: footprint[1]!, color: 0x696b60 },
        { a: footprint[1]!, b: contact, color: 0x555d57 }]
      : [{ a: footprint[0]!, b: footprint[1]!, color: 0x696b60 },
        { a: contact, b: footprint[0]!, color: 0x50584f }];
    const faces = (bottom: number, top: number): Face[] => exposed.map(edge => ({
      points: [raised(edge.a, bottom), raised(edge.b, bottom), raised(edge.b, top), raised(edge.a, top)], color: edge.color
    }));
    const foundation: Face[] = [...faces(0, foundationHeight),
      { points: footprint.map(p => raised(p, foundationHeight)), color: 0x646b60 }];
    const upper: Face[] = [...faces(foundationHeight, height),
      { points: footprint.map(p => raised(p, height)), color: 0x929383 }];
    return { id: index === 0 ? 'west' : 'east', footprint, contact,
      localFootprint: footprint.map(local), foundation, upper,
      upperPolygons: upper.map(face => face.points.map(local)) };
  });
}

/** The reviewed coarse stone recipe, partitioned rather than overpainted.
 * Each physical face is tiled by disjoint stone/mortar interiors: no support
 * fill sits under a stone and compounds the upper object's cutaway alpha.
 * Shared raster edges still require native pixel review. Geometry/occlusion
 * continues to use the original twelve faces, never these paint tiles.
 * Candidate upper-front relief recipe: 300 quads / 1200 points across the same four
 * create-once Graphics. Only the 36 broad upper-front stone outlines contain three uneven bevels
 * and one face. All 40 other stones and 116 mortar/support tiles are unchanged. */
export function townCourtyardSurface(face: Face, layer: string, faceIndex: number, wallIndex: number): Face[] {
  const foundation = layer === 'foundation', cap = faceIndex === 2, end = faceIndex === 1;
  // Recessed joints stay legible in the compact view. Keep the outer 0.32 px
  // margin and all physical corners unchanged; widen only internal joints.
  const base = foundation ? (cap ? 0x746c5c : 0x514c42) : (cap ? 0x6b6252 : 0x554f44);
  const edgeInset = .32, jointInset = .7;
  if (foundation && cap) return [{ points: face.points, color: base }];
  const palette = foundation ? [0x6e6655, 0x746b59, 0x696353, 0x776e5b]
    : end ? [0x776d5b, 0x7a705d]
    : cap ? [0x978b72, 0xa09277, 0x92866f, 0x9c8f75, 0x988d77]
    : [0x7c715e, 0x877a65, 0x786e5c, 0x817461, 0x897b65, 0x7d7461];
  const [a, b, c, d] = face.points as [Vec2, Vec2, Vec2, Vec2];
  const length = Math.hypot(b.x - a.x, b.y - a.y), extent = Math.hypot(d.x - a.x, d.y - a.y);
  const point = (u: number, v: number): Vec2 => {
    // Keep the four original support vertices exact, including the butt notch.
    if ((u === 0 || u === 1) && (v === 0 || v === 1)) return { ...(v === 0 ? (u === 0 ? a : b) : (u === 0 ? d : c)) };
    return { x: a.x + (b.x - a.x) * u + (d.x - a.x) * v,
      y: a.y + (b.y - a.y) * u + (d.y - a.y) * v };
  };
  const tiles: Face[] = [];
  const tile = (u0: number, u1: number, v0: number, v1: number, color: number) => {
    if (u1 > u0 && v1 > v0) tiles.push({ color, points: [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)] });
  };
  // Shallow chipped-looking edges are paint only. Each selected stone is a four-quad
  // partition of its exact prior rectangle, not a bevel overlay. In particular,
  // its center is never painted underneath the rim during cutaway.
  const stone = (u0: number, u1: number, v0: number, v1: number, color: number, stamp: number) => {
    if (foundation || faceIndex !== 0 || (u1 - u0) * length < 24) { tile(u0, u1, v0, v1, color); return; }
    const outer = [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
    const width = (u1 - u0) * length, height = (v1 - v0) * extent;
    const inset = (corner: number, vertical: boolean) => {
      const variation = ((stamp * 7 + corner * 3) % 5) * .16;
      return Math.min((vertical ? height : width) * .23, (vertical ? .8 : 1.1) + variation);
    };
    const inner = outer.map((_p, i) => point(
      (i === 0 || i === 3 ? u0 : u1 - inset(i, false) / length),
      (i < 2 ? v0 + inset(i, true) / extent : v1 - inset(i, true) / extent)
    ));
    const tint = (delta: number) => {
      const channel = (shift: number) => Math.max(0, Math.min(255, ((color >> shift) & 255) + delta));
      return (channel(16) << 16) | (channel(8) << 8) | channel(0);
    };
    // A consistent upper-left light: front top bevel catches it, lower/right
    // edges recede. The center reaches the left boundary, so no redundant
    // left rim is drawn. Flat caps/end faces/foundations keep their exact paint.
    const light = cap ? [-12, -7, 17, 7] : [-19, -9, 24, 9];
    for (let i = 0; i < 3; i++) {
      const next = (i + 1) % 4;
      tiles.push({ color: tint(light[i]!), points: [outer[i]!, outer[next]!, inner[next]!, inner[i]!] });
    }
    tiles.push({ color: tint((stamp % 5) - 2), points: inner });
  };
  const rows = cap || foundation ? 1 : 2;
  const widths = foundation ? [70, 88, 76, 94, 82] : [44, 56, 48, 52, 60, 46, 54];
  const seed = wallIndex * 2 + (cap ? 1 : 0);
  let previousV = 0;
  for (let row = 0; row < rows; row++) {
    const v0 = row / rows + (row === 0 ? edgeInset : jointInset) / extent;
    const v1 = (row + 1) / rows - (row === rows - 1 ? edgeInset : jointInset) / extent;
    tile(0, 1, previousV, v0, base);
    let previousU = 0, start = row ? -25 : 0, index = 0;
    while (start < length) {
      const stop = end ? length : start + widths[(index + seed + row * 2) % widths.length]!;
      const u0 = (Math.max(0, end ? 0 : start) + (end || start <= 0 ? edgeInset : jointInset)) / length;
      const u1 = (Math.min(length, stop) - (stop >= length ? edgeInset : jointInset)) / length;
      if (u1 > u0) {
        tile(previousU, u0, v0, v1, base);
        stone(u0, u1, v0, v1, palette[(index + row * 3 + wallIndex) % palette.length]!, index + row * 11 + wallIndex * 19 + faceIndex * 7);
        previousU = u1;
      }
      start = stop; index++;
    }
    tile(previousU, 1, v0, v1, base);
    previousV = v1;
  }
  tile(0, 1, previousV, 1, base);
  return tiles;
}

/** Area-owned, create-once vector art. The solid plinth stays readable when
 * the upper wall cuts away. No added texture, clock, camera or input state. */
export function createTownCourtyard(scene: Phaser.Scene, addToWorld: (object: Phaser.GameObjects.GameObject) => void) {
  const geometry = townCourtyardGeometry();
  const graphics: Phaser.GameObjects.Graphics[] = [];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const graphic of graphics) graphic.destroy();
    graphics.length = 0;
  };
  try {
    const draw = (wall: typeof geometry[number], layer: string, faces: Face[]) => {
      const graphic = scene.add.graphics();
      graphics.push(graphic);
      graphic.setName(`town-courtyard-${wall.id}-${layer}`).setDepth(wall.contact.y + (layer === 'foundation' ? 19 : 20));
      for (const [faceIndex, face] of faces.entries()) {
        for (const paint of townCourtyardSurface(face, layer, faceIndex, wall.id === 'west' ? 0 : 1)) {
          graphic.fillStyle(paint.color, 1).fillPoints(paint.points, true);
        }
      }
      addToWorld(graphic);
      return graphic;
    };
    // At equal depth both plinths precede both upper layers, including the
    // shared elbow. A later-created foundation must not paint over a cap.
    const walls = geometry.map(wall => ({ wall, foundation: draw(wall, 'foundation', wall.foundation) }));
    const layers = walls.map(entry => ({ ...entry, upper: draw(entry.wall, 'upper', entry.wall.upper) }));
    return {
      objects: Object.freeze([...graphics]),
      blocksMovement: (from: Vec2, to: Vec2, radius: number) => !destroyed &&
        geometry.some(wall => crossesTownFootprint(from, to, radius, wall.footprint)),
      updateActor: (actor: Vec2) => {
        if (destroyed) return;
        let lowestUpperDepth = Infinity;
        for (const { wall, upper } of layers) {
          const state = townFacadePresentation(actor, wall.contact, wall.localFootprint, wall.upperPolygons);
          upper.setDepth(state.depth).setAlpha(state.alpha);
          lowestUpperDepth = Math.min(lowestUpperDepth, state.depth);
        }
        // Treat the connected opaque plinth as one lower layer. Per-arm depth
        // can otherwise paint a height-8 cap OVER the neighboring upper face
        // when only that neighbor lowers its depth for a front-side actor.
        for (const { foundation } of layers) foundation.setDepth(lowestUpperDepth - 1);
      },
      destroy
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
