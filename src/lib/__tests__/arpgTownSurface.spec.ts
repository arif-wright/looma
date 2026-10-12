import { describe, expect, it } from 'vitest';
import { sampleTownSurface, townSurfaceTriangle, TOWN_SURFACE_GRID, TOWN_SURFACE_SHARPNESS } from '../games/arpg/assets/townGroundSurface';
import { townBackdropGeometry, townBoundaryGeometry, townBoundaryShadow } from '../games/arpg/assets/townBoundary';
const iso = (x: number, y: number) => ({ x: (x - y) * 64 + 1152, y: (x + y) * 32 - 200 });
const inverse = (x: number, y: number) => ({ x: ((x - 1152) / 64 + (y + 200) / 32) / 2, y: ((y + 200) / 32 - (x - 1152) / 64) / 2 });
const fixture = () => {
  const source = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.min(x, 255 - x), v = Math.min(y, 255 - y), i = (y * 256 + x) * 4;
    source[i] = u; source[i + 1] = v; source[i + 2] = (u + v) >> 1; source[i + 3] = 255;
  }
  return source;
};
describe('town surface sampling and blocked-ring rendering (no renderer)', () => {
  it('samples deterministically without changing source bytes and retains opaque output', () => {
    const source = fixture(), original = source.slice();
    const first = sampleTownSurface(source, 256, 320, 192), second = sampleTownSurface(source, 256, 320, 192);
    expect(first).toEqual(second);expect(source).toEqual(original);
    expect(first.filter((_v, index) => index % 4 === 3).every(alpha => alpha === 255)).toBe(true);
  });
  it('uses a caller-provided output buffer instead of allocating another full field', () => {
    const output = new Uint8ClampedArray(32 * 32 * 4);
    const source = fixture(), original = source.slice();
    let reads = 0;
    const countedSource = new Proxy(source, {
      get(target, property) {
        if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) reads++;
        return Reflect.get(target, property, target);
      }
    });
    expect(sampleTownSurface(countedSource, 256, 32, 32, output)).toBe(output);
    // The weight-only change retains three RGB lookups per pixel and one
    // caller-owned output. This is an operation count, not a timing claim.
    expect(reads).toBe(32 * 32 * 3 * 3);
    expect(source).toEqual(original);
    expect(output).toHaveLength(32 * 32 * 4);
    expect(output.filter((_v, index) => index % 4 === 3).every(alpha => alpha === 255)).toBe(true);
    expect(() => sampleTownSurface(fixture(), 256, 32, 32, new Uint8ClampedArray(2))).toThrow('Wrong town surface');
  });
  it.each([[255, 16, 16], [256, 0, 16], [256, 16, -1], [256, 1025, 16], [256, 16, 1025], [256, 16.5, 16]])('rejects unbounded or invalid sampling dimensions %s/%s/%s', (size, width, height) => {
    expect(() => sampleTownSurface(fixture(), size, width, height)).toThrow('bounded sampling');
  });
  it('does not retain the old exact eight-cell material period', () => {
    const field = sampleTownSurface(fixture(), 256, 896, 576);
    expect(field).toHaveLength(896 * 576 * 4);
    for (const [dx, dy] of [[256, 0], [0, 256]]) {
      let different = 0, total = 0;
      for (let y = 0; y < 576 - dy!; y += 5) for (let x = 0; x < 896 - dx!; x += 5) {
        const a = (y * 896 + x) * 4, b = ((y + dy!) * 896 + x + dx!) * 4;
        if (field[a] !== field[b] || field[a + 1] !== field[b + 1]) different++;total++;
      }
      expect(different / total).toBeGreaterThan(0.95);
    }
  });
  it.each([[70, 90, 1, 1], [160, 70, 1, 0], [70, 160, 0, 1], [160, 160, 1, 1]])('has continuous shared-edge offsets and weights at %s,%s', (u, v, dx, dy) => {
    const weights = (x: number, y: number) => new Map(townSurfaceTriangle(x, y).map(p => [`${p.x},${p.y},${p.offsetX},${p.offsetY}`, p.weight]));
    const a = weights(u - dx * 1e-7, v - dy * 1e-7), b = weights(u + dx * 1e-7, v + dy * 1e-7);
    for (const key of new Set([...a.keys(), ...b.keys()])) expect(Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0))).toBeLessThan(1e-7);
    expect([...a.values()].reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });
  it('changes source phase only: scale and orientation stay one source pixel per UV pixel', () => {
    expect(TOWN_SURFACE_GRID).toBe(160);
    expect(TOWN_SURFACE_SHARPNESS).toBe(8);
    const a = townSurfaceTriangle(30, 20), b = townSurfaceTriangle(31, 20);
    expect(a.map(p => [p.x, p.y, p.offsetX, p.offsetY])).toEqual(b.map(p => [p.x, p.y, p.offsetX, p.offsetY]));
    // Both triangle orientations retain their barycentric support; only the
    // normalized weight exponent changes. No visual-quality claim is made.
    for (const [u, v, weights] of [[40, 20, [5, 2, 1]], [140, 80, [3, 1, 4]]] as const) {
      const raised = weights.map(weight => weight ** 8), total = raised.reduce((sum, weight) => sum + weight, 0);
      const actual = townSurfaceTriangle(u, v);
      expect(actual).toHaveLength(3);
      actual.forEach((vertex, index) => expect(vertex.weight).toBeCloseTo(raised[index]! / total, 14));
      expect(actual.reduce((sum, vertex) => sum + vertex.weight, 0)).toBeCloseTo(1, 14);
    }
  });
  it('keeps every coping polygon wholly on the original blocked ring', () => {
    const faces = townBoundaryGeometry(iso);
    expect(faces.length).toBeLessThan(120);expect(faces).toEqual(townBoundaryGeometry(iso));
    for (const face of faces) {
      const points = face.points.map(p => inverse(p.x, p.y));
      expect(points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))).toBe(false);
      // Each entire convex face lies in a single blocked half-plane, not just
      // a vertex test that could hide a polygon crossing the playable center.
      expect([points.every(p => p.x <= .5 + 1e-10), points.every(p => p.x >= 26.5 - 1e-10),
        points.every(p => p.y <= .5 + 1e-10), points.every(p => p.y >= 16.5 - 1e-10)].some(Boolean)).toBe(true);
      expect(points.every(p => p.x >= -.5 - 1e-10 && p.x <= 27.5 + 1e-10 && p.y >= -.5 - 1e-10 && p.y <= 17.5 + 1e-10)).toBe(true);
    }
  });
  it('joins all four continuous base courses at exact shared corners', () => {
    const faces = townBoundaryGeometry(iso), base = faces.filter(face => face.color === 0x3e4644);
    expect(base).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const next = base[(i + 1) % 4]!;
      expect(base[i]!.points[1]).toEqual(next.points[0]);expect(base[i]!.points[2]).toEqual(next.points[3]);
      const [a, b] = base[i]!.points;
      expect(Math.abs((b!.y - a!.y) / (b!.x - a!.x))).toBe(.5);
    }
  });
  it('keeps contact shadows inside the existing ground, with no new texture or collider', () => {
    const shadows = townBoundaryShadow(iso);expect(shadows).toHaveLength(12);
    for (const shadow of shadows) {
      expect(shadow.alpha).toBeGreaterThan(0);expect(shadow.alpha).toBeLessThanOrEqual(.16);
      expect(shadow.points.map(p => inverse(p.x, p.y)).every(p => p.x >= .5 - 1e-10 && p.x <= 26.5 + 1e-10 && p.y >= .5 - 1e-10 && p.y <= 16.5 + 1e-10)).toBe(true);
    }
  });
});

const area = (points: {x: number; y: number}[]) => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length]!;return sum + p.x * q.y - p.y * q.x;
}, 0)) / 2;
describe('quiet exterior field geometry (no renderer)', () => {
  it('uses exactly four deterministic bounded exterior fills', () => {
    const first = townBackdropGeometry(iso);
    expect(first).toEqual(townBackdropGeometry(iso));
    expect(first.faces).toHaveLength(4);
    expect(first.faces.reduce((sum, face) => sum + face.points.length, 0)).toBe(20);
    expect(first.faces.reduce((sum, face) => sum + face.points.length - 2, 0)).toBe(12);
    expect(first.bounds).toEqual({ x: -256, y: -488, width: 3456, height: 1984 });
    for (const p of first.faces.flatMap(face => face.points)) {
      expect(p.x).toBeGreaterThanOrEqual(first.bounds.x);expect(p.y).toBeGreaterThanOrEqual(first.bounds.y);
      expect(p.x).toBeLessThanOrEqual(first.bounds.x + first.bounds.width);
      expect(p.y).toBeLessThanOrEqual(first.bounds.y + first.bounds.height);
    }
  });
  it('keeps every WHOLE convex face outside the full blocked-cell diamond', () => {
    for (const face of townBackdropGeometry(iso).faces) {
      const p = face.points.map(point => inverse(point.x, point.y));
      expect(p.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
      expect([p.every(q => q.x <= -.5 + 1e-10), p.every(q => q.x >= 27.5 - 1e-10),
        p.every(q => q.y <= -.5 + 1e-10), p.every(q => q.y >= 17.5 - 1e-10)].some(Boolean)).toBe(true);
      const turns = p.map((a, i) => {
        const b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
        return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      });
      expect(turns.every(turn => turn >= -1e-10) || turns.every(turn => turn <= 1e-10)).toBe(true);
      expect(area(face.points)).toBeGreaterThan(0);
    }
  });
  it('covers the padded exterior rectangle exactly without a fill over the blocked ring', () => {
    const { faces, bounds } = townBackdropGeometry(iso), field = faces.filter(f => f.kind === 'field');
    const outer = [iso(-.5, -.5), iso(27.5, -.5), iso(27.5, 17.5), iso(-.5, 17.5)];
    expect(field).toHaveLength(4);
    expect(field.reduce((sum, f) => sum + area(f.points), 0)).toBe(bounds.width * bounds.height - area(outer));
    for (let i = 0; i < 4; i++) {
      const a = field[i]!.points, b = field[(i + 1) % 4]!.points;
      expect(a[1]).toEqual(b[0]);expect(a[2]).toEqual(b[4]);
    }
  });
  it('uses only subdued cool field colors without scenery or destination cues', () => {
    const faces = townBackdropGeometry(iso).faces;
    expect(new Set(faces.map(f => f.kind))).toEqual(new Set(['field']));
    expect(faces.map(f => f.color)).toEqual([0x172125, 0x141d21, 0x141d21, 0x1a2427]);
    expect(faces.every(f => Math.max(f.color >> 16, (f.color >> 8) & 255, f.color & 255) <= 39)).toBe(true);
  });
});
