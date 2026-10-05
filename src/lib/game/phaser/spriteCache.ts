// A soft actor-atlas target, not a total scene/GPU limit. Active artwork stays intact.
export const SPRITE_CACHE_TARGET_BYTES = 16 * 1024 * 1024;
export type CachedSpritePage = { key: string; bytes: number; lastUsed: number };

export const spritePageEvictions = (pages: readonly CachedSpritePage[], protectedKeys: ReadonlySet<string>, targetBytes = SPRITE_CACHE_TARGET_BYTES) => {
  let remainingBytes = pages.reduce((total, page) => total + page.bytes, 0);
  const evictions: string[] = [];
  for (const page of [...pages].sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (remainingBytes <= targetBytes) break;
    if (protectedKeys.has(page.key)) continue;
    evictions.push(page.key);
    remainingBytes -= page.bytes;
  }
  return { evictions, remainingBytes };
};
