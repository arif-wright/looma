// Analysis only: never registers a texture or changes scene pixels.
export const VISIBLE_ALPHA_THRESHOLD = 32;
export function scanAlphaBounds(data, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) throw new Error('Invalid decoded pixel buffer');
  let left = width, top = height, right = -1, bottom = -1, opaquePixels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < VISIBLE_ALPHA_THRESHOLD) continue;
    opaquePixels++;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return opaquePixels ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1, opaquePixels } : null;
}
