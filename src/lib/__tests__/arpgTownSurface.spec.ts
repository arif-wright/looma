import { describe, expect, it } from 'vitest';
import { sampleTownSurface, townSurfaceTriangle } from '../games/arpg/assets/townGroundSurface';
import { townBoundaryGeometry, townBoundaryShadow } from '../games/arpg/assets/townBoundary';
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
    expect(sampleTownSurface(fixture(), 256, 32, 32, output)).toBe(output);
    expect(() => sampleTownSurface(fixture(), 256, 32, 32, new Uint8ClampedArray(2))).toThrow('Wrong town surface');
  });
  it.each([[255, 16, 16], [256, 0, 16], [256, 16, -1], [256, 1025, 16], [256, 16, 1025], [256, 16.5, 16]])('rejects unbounded or invalid sampling dimensions %s/%s/%s', (size, width, height) => {
    expect(() => sampleTownSurface(fixture(), size, width, height)).toThrow('bounded sampling');
  });
  it('does not retain the old exact eight-cell material period', () => {
    const field = sampleTownSurface(fixture(), 256, 896, 576);
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
    const a = townSurfaceTriangle(30, 20), b = townSurfaceTriangle(31, 20);
    expect(a.map(p => [p.x, p.y, p.offsetX, p.offsetY])).toEqual(b.map(p => [p.x, p.y, p.offsetX, p.offsetY]));
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
