export type RestRequest = { requestId: string; companionId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRestRequest = (value: unknown): value is RestRequest => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<RestRequest>;
  return typeof row.requestId === 'string' && uuid.test(row.requestId) &&
    typeof row.companionId === 'string' && uuid.test(row.companionId);
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (companionId: string) => `memvoya:pending-shared-rest:${companionId}`;
export const pendingRest = (storage: Storage | null, companionId: string): RestRequest | null => {
  if (!storage) return null;
  try {
    const value: unknown = JSON.parse(storage.getItem(key(companionId)) ?? 'null');
    return isRestRequest(value) && value.companionId === companionId ? value : null;
  } catch { return null; }
};
export const rememberRest = (storage: Storage | null, request: RestRequest) => {
  try { storage?.setItem(key(request.companionId), JSON.stringify(request)); } catch { /* In-memory retry still works. */ }
};
export const forgetRest = (storage: Storage | null, request: RestRequest) => {
  // An older response must never clear a newer pending request.
  if (pendingRest(storage, request.companionId)?.requestId !== request.requestId) return;
  try { storage?.removeItem(key(request.companionId)); } catch { /* Replay remains safe. */ }
};
