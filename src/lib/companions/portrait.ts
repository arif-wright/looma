const STORAGE_PREFIX = 'looma:companionPortrait:';

const safeKey = (instanceId: string) => `${STORAGE_PREFIX}${instanceId}`;

export const getCachedCompanionPortrait = (instanceId: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(safeKey(instanceId));
  } catch {
    return null;
  }
};

export const setCachedCompanionPortrait = (instanceId: string, dataUrl: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(safeKey(instanceId), dataUrl);
  } catch {
    // Ignore quota/security errors; portrait is best-effort.
  }
};

export const clearCachedCompanionPortrait = (instanceId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(safeKey(instanceId));
  } catch {
    // Ignore.
  }
};

// Reject obviously bad captures (tiny/blank frames) so we don't cache an empty square forever.
export const isProbablyValidPortrait = (dataUrl: string | null | undefined) => {
  if (typeof dataUrl !== 'string') return false;
  if (!dataUrl.startsWith('data:image/')) return false;
  // 1x1 or "almost empty" base64 strings are typically < ~2KB.
  if (dataUrl.length < 2500) return false;
  return true;
};

// Some browsers will return a "valid" PNG data URL that is effectively a flat dark frame.
// This adds a lightweight pixel-variance check to avoid caching unusable portraits.
export const isProbablyNonBlankPortrait = async (dataUrl: string | null | undefined) => {
  if (typeof window === 'undefined') return false;
  if (!isProbablyValidPortrait(dataUrl) || typeof dataUrl !== 'string') return false;

  try {
    const img = new Image();
    // Same-origin data URL; no need for crossOrigin.
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image_load_failed'));
    });
    img.src = dataUrl;
    await loaded;

    const w = 24;
    const h = 24;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;

    let sum = 0;
    let sumSq = 0;
    let alphaSum = 0;
    const count = w * h;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const a = pixels[i + 3] ?? 0;
      // Luma-ish brightness.
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += y;
      sumSq += y * y;
      alphaSum += a;
    }

    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    const alphaMean = alphaSum / count;

    // Too transparent or too uniform/dark means it will look like a blank square in our UI.
    if (alphaMean < 8) return false;
    if (mean < 8 && variance < 6) return false;
    if (variance < 4) return false;
    return true;
  } catch {
    return false;
  }
};

// Deliverable: captureCompanionPortrait(instanceId): Promise<string | null>
// Implementation supports an optional capture function for cases where the portrait
// is sourced from a component ref (preferred) instead of DOM querying.
export const captureCompanionPortrait = async (
  instanceId: string,
  capture?: () => Promise<string | null>
): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  const cached = getCachedCompanionPortrait(instanceId);
  if (cached && isProbablyValidPortrait(cached)) return cached;
  if (cached && !isProbablyValidPortrait(cached)) clearCachedCompanionPortrait(instanceId);

  try {
    const dataUrl = capture ? await capture() : null;
    if (isProbablyValidPortrait(dataUrl) && typeof dataUrl === 'string' && (await isProbablyNonBlankPortrait(dataUrl))) {
      setCachedCompanionPortrait(instanceId, dataUrl);
      return dataUrl;
    }
  } catch (err) {
    console.debug('[portrait] capture failed', err);
  }

  return null;
};
