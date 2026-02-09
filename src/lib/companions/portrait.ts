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

// Deliverable: captureCompanionPortrait(instanceId): Promise<string | null>
// Implementation supports an optional capture function for cases where the portrait
// is sourced from a component ref (preferred) instead of DOM querying.
export const captureCompanionPortrait = async (
  instanceId: string,
  capture?: () => Promise<string | null>
): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  const cached = getCachedCompanionPortrait(instanceId);
  if (cached) return cached;

  try {
    const dataUrl = capture ? await capture() : null;
    if (dataUrl && typeof dataUrl === 'string') {
      setCachedCompanionPortrait(instanceId, dataUrl);
      return dataUrl;
    }
  } catch (err) {
    console.debug('[portrait] capture failed', err);
  }

  return null;
};

