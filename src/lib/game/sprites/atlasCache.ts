export type ResourceLease<T> = { resource: T; release: () => void };
type CacheEntry<T> = { promise: Promise<T>; references: number; dispose: (resource: T) => void };

export class ReferenceAssetCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  acquire(key: string, loader: () => Promise<T>, dispose: (resource: T) => void): Promise<ResourceLease<T>> {
    let entry = this.entries.get(key);
    if (!entry) {
      const promise = loader().catch((error) => {
        this.entries.delete(key);
        throw error;
      });
      entry = { promise, references: 0, dispose };
      this.entries.set(key, entry);
    }
    entry.references += 1;
    let released = false;
    return entry.promise.then((resource) => ({
      resource,
      release: () => {
        if (released) return;
        released = true;
        const current = this.entries.get(key);
        if (!current) return;
        current.references -= 1;
        if (current.references <= 0) {
          this.entries.delete(key);
          current.dispose(resource);
        }
      }
    }));
  }

  has(key: string) { return this.entries.has(key); }
  references(key: string) { return this.entries.get(key)?.references ?? 0; }
  size() { return this.entries.size; }
}

export const acquireWithFallback = async <T>(
  cache: ReferenceAssetCache<T>,
  primary: { key: string; load: () => Promise<T> },
  fallback: { key: string; load: () => Promise<T> },
  dispose: (resource: T) => void
) => {
  try {
    return { ...(await cache.acquire(primary.key, primary.load, dispose)), fallback: false };
  } catch {
    return { ...(await cache.acquire(fallback.key, fallback.load, dispose)), fallback: true };
  }
};
