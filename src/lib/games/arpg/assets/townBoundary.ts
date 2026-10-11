import type { Vec2 } from '../ecs/components';

export type TownBoundaryFace = { points: Vec2[]; color: number };
const ring = (inset: number, columns: number, rows: number) => [
  { x: inset, y: inset }, { x: columns - 1 - inset, y: inset },
  { x: columns - 1 - inset, y: rows - 1 - inset }, { x: inset, y: rows - 1 - inset }
];
const mix = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Flat low coping on the already-blocked perimeter cells, never a new wall or
 * collider. Keeping all geometry on the outside of the half-cell interior
 * avoids painting a barrier over reachable ground. All axes are exact2:1. */
export function townBoundaryGeometry(iso: (x: number, y: number) => Vec2, columns = 28, rows = 18) {
  if (columns < 3 || rows < 3) throw new Error('Town boundary needs an interior.');
  const inner = ring(0.5, columns, rows), cap = ring(0.15, columns, rows), outer = ring(-0.5, columns, rows);
  const faces: TownBoundaryFace[] = [];
  const add = (points: Vec2[], color: number) => faces.push({ points: points.map(p => iso(p.x, p.y)), color });
  for (let edge = 0; edge < 4; edge++) {
    const next = (edge + 1) % 4;
    add([inner[edge]!, inner[next]!, outer[next]!, outer[edge]!], 0x3e4644);
    // A restrained outer course makes the dark beyond the map read as an
    // intentional drop in the platform, rather than gaps between legacy posts.
    const middle = ring(-0.28, columns, rows);
    add([middle[edge]!, middle[next]!, outer[next]!, outer[edge]!], 0x283237);
    const count = Math.ceil(Math.hypot(inner[next]!.x - inner[edge]!.x, inner[next]!.y - inner[edge]!.y) / 0.9);
    for (let stone = 0; stone < count; stone++) {
      const start = (stone + 0.018) / count, end = (stone + 0.982) / count;
      const variation = ((stone * 17 + edge * 31) % 13) - 6;
      const color = ((119 + variation) << 16) | ((118 + variation) << 8) | (106 + variation);
      add([mix(inner[edge]!, inner[next]!, start), mix(inner[edge]!, inner[next]!, end),
        mix(cap[edge]!, cap[next]!, end), mix(cap[edge]!, cap[next]!, start)], color);
    }
  }
  return faces;
}

/** Subtle contact shade only, wholly inside the existing clipped ground. */
export function townBoundaryShadow(iso: (x: number, y: number) => Vec2, columns = 28, rows = 18) {
  return [0, 1, 2].flatMap(band => {
    const outer = ring(0.5 + band * 0.12, columns, rows), inner = ring(0.62 + band * 0.12, columns, rows);
    return outer.map((point, edge) => ({ alpha: [0.16, 0.09, 0.035][band]!,
      points: [point, outer[(edge + 1) % 4]!, inner[(edge + 1) % 4]!, inner[edge]!].map(p => iso(p.x, p.y)) }));
  });
}
