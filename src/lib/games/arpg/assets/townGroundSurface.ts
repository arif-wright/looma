// Create-time surface sampling only. This changes neither world projection nor
// stone scale: every source lookup has unit UV scale and a fixed integer offset.
// The source is still explicitly mirrored; it is not natively periodic art.
export const TOWN_SURFACE_GRID = 160;
export const TOWN_SURFACE_SHARPNESS = 6;

const hash = (x: number, y: number, salt: number) => {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
};
export function townSurfaceTriangle(u: number, v: number) {
  const x = Math.floor(u / TOWN_SURFACE_GRID), y = Math.floor(v / TOWN_SURFACE_GRID);
  const fx = u / TOWN_SURFACE_GRID - x, fy = v / TOWN_SURFACE_GRID - y;
  const vertices = fx + fy <= 1
    ? [{ x, y, weight: 1 - fx - fy }, { x: x + 1, y, weight: fx }, { x, y: y + 1, weight: fy }]
    : [{ x: x + 1, y: y + 1, weight: fx + fy - 1 }, { x, y: y + 1, weight: 1 - fx }, { x: x + 1, y, weight: 1 - fy }];
  const total = vertices.reduce((sum, vertex) => sum + vertex.weight ** TOWN_SURFACE_SHARPNESS, 0);
  return vertices.map(vertex => ({ x: vertex.x, y: vertex.y,
    weight: vertex.weight ** TOWN_SURFACE_SHARPNESS / total,
    offsetX: hash(vertex.x, vertex.y, 0x51ab47) & 255,
    offsetY: hash(vertex.x, vertex.y, 0x930e21) & 255 }));
}

/** Opaque source material -> bounded UV field. Shared triangle edges use the
 * same vertex hashes and weights, so there is no hard patch boundary. */
export function sampleTownSurface(source: Uint8ClampedArray, size: number, width: number, height: number, output?: Uint8ClampedArray) {
  if (size !== 256 || source.length !== size * size * 4 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) {
    throw new Error('Town surface exceeds its bounded sampling contract.');
  }
  const result = output ?? new Uint8ClampedArray(width * height * 4);
  if (result.length !== width * height * 4) throw new Error('Wrong town surface output size.');
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const vertices = townSurfaceTriangle(x, y), out = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      let value = 0;
      for (const vertex of vertices) {
        const index = (((y + vertex.offsetY) & 255) * size + ((x + vertex.offsetX) & 255)) * 4 + channel;
        value += source[index]! * vertex.weight;
      }
      result[out + channel] = Math.round(value);
    }
    result[out + 3] = 255;
  }
  return result;
}
