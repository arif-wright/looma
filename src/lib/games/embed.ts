type BridgeHandler = (payload: any) => void;

type BridgeOptions = {
  parent?: Window;
  origin?: string;
};

export const createGameBridge = ({ parent = window.parent, origin = '*' }: BridgeOptions = {}) => {
  const listeners = new Map<string, Set<BridgeHandler>>();

  const post = (type: string, payload?: any) => {
    if (!parent) return;
    parent.postMessage({ type, payload }, origin);
  };

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== parent || (origin !== '*' && event.origin !== origin)) return;
    const data = event.data ?? {};
    const type = typeof data.type === 'string' ? data.type : null;
    if (!type) return;
    const payload = data.payload ?? null;
    const handlers = listeners.get(type);
    handlers?.forEach((handler) => handler(payload));
  };

  window.addEventListener('message', handleMessage);

  return {
    on(type: string, handler: BridgeHandler) {
      const set = listeners.get(type) ?? new Set<BridgeHandler>();
      set.add(handler);
      listeners.set(type, set);
      return () => {
        const bucket = listeners.get(type);
        bucket?.delete(handler);
        if (bucket && bucket.size === 0) listeners.delete(type);
      };
    },
    sendReady() {
      post('GAME_READY');
    },
    notifyStart(payload?: any) {
      post('GAME_START', payload);
    },
    notifyComplete(payload: { score: number; durationMs: number; nonce: string; signature: string }) {
      post('GAME_COMPLETE', payload);
    },
    destroy() {
      window.removeEventListener('message', handleMessage);
      listeners.clear();
    }
  };
};
