const listeners = new Map<string, Set<(payload: any) => void>>();

export function emitGameEvent(kind: string, payload?: any): void {
  const handlers = listeners.get(kind);
  if (!handlers || handlers.size === 0) return;
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[gameEvents] handler for "${kind}" failed`, err);
    }
  });
}

export function subscribe(kind: string, handler: (payload: any) => void): () => void {
  if (!listeners.has(kind)) {
    listeners.set(kind, new Set());
  }
  const handlers = listeners.get(kind)!;
  handlers.add(handler);
  return () => {
    const set = listeners.get(kind);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      listeners.delete(kind);
    }
  };
}
