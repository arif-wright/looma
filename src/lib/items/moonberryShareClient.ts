/** Client-only request bookkeeping. Never a source of truth for stock or ownership. */
export const MOONBERRY_SHARE_TIMEOUT_MS = 10_000;
export const MOONBERRY_INTENT_EVENT = 'memvoya:moonberry-intent';
const PREFIX = 'memvoya:moonberry-share:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ShareIntent = { requestId: string; userItemId: string; companionId: string };
export type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type SavedIntent = { state: 'ready'; intent: ShareIntent | null } | { state: 'unavailable' };
export type ShareOutcome =
  | { kind: 'shared'; replayed: boolean; reaction?: string }
  | { kind: 'empty' }
  | { kind: 'rejected'; code: string }
  | { kind: 'unauthorized' }
  | { kind: 'uncertain' };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const isShareIntent = (value: unknown): value is ShareIntent & Record<string, unknown> => record(value) &&
  ['requestId', 'userItemId', 'companionId'].every((key) => typeof value[key] === 'string' && UUID.test(value[key] as string));
export const sameShareIntent = (a: ShareIntent, b: ShareIntent) => a.requestId.toLowerCase() === b.requestId.toLowerCase() && a.userItemId.toLowerCase() === b.userItemId.toLowerCase() && a.companionId.toLowerCase() === b.companionId.toLowerCase();
const storageKey = (ownerId: string) => `${PREFIX}${ownerId.toLowerCase()}`;

export function readShareIntent(storage: IntentStorage, ownerId: string): SavedIntent {
  if (!UUID.test(ownerId)) return { state: 'unavailable' };
  try {
    const raw = storage.getItem(storageKey(ownerId));
    if (raw === null) return { state: 'ready', intent: null };
    const value: unknown = JSON.parse(raw);
    if (!isShareIntent(value)) return { state: 'unavailable' };
    // Project only identifiers, even if a modified browser store has extra fields.
    return { state: 'ready', intent: { requestId: value.requestId.toLowerCase(), userItemId: value.userItemId.toLowerCase(), companionId: value.companionId.toLowerCase() } };
  } catch { return { state: 'unavailable' }; }
}

/** Synchronous owner-wide claim: another stack/companion cannot replace an unresolved intent. */
export function rememberShareIntent(storage: IntentStorage, ownerId: string, intent: ShareIntent): boolean {
  const saved = readShareIntent(storage, ownerId);
  if (!isShareIntent(intent) || saved.state !== 'ready' || (saved.intent && !sameShareIntent(saved.intent, intent))) return false;
  try {
    storage.setItem(storageKey(ownerId), JSON.stringify({ requestId: intent.requestId, userItemId: intent.userItemId, companionId: intent.companionId }));
    const checked = readShareIntent(storage, ownerId);
    return checked.state === 'ready' && checked.intent !== null && sameShareIntent(checked.intent, intent);
  } catch { return false; }
}

/** A late response must never clear a different, newer intent. */
export function forgetShareIntent(storage: IntentStorage, ownerId: string, intent: ShareIntent): boolean {
  const saved = readShareIntent(storage, ownerId);
  if (saved.state !== 'ready' || (saved.intent && !sameShareIntent(saved.intent, intent))) return false;
  try { storage.removeItem(storageKey(ownerId)); return true; } catch { return false; }
}

/** Only a bound, well-formed receipt proves consumption or depletion. Ignore historical stock. */
export function parseShareOutcome(status: number, body: unknown, intent: ShareIntent): ShareOutcome {
  if (status === 401) return { kind: 'unauthorized' };
  if (!record(body) || status >= 500) return { kind: 'uncertain' };
  if (status === 200 || (status === 409 && body.status === 'empty')) {
    if (!isShareIntent(body) || !sameShareIntent(body, intent) || typeof body.replayed !== 'boolean' ||
      !Number.isSafeInteger(body.quantityAfter) || (body.quantityAfter as number) < 0) return { kind: 'uncertain' };
    if (status === 409 && body.ok === false && body.status === 'empty' && body.quantityAfter === 0) return { kind: 'empty' };
    if (status === 200 && body.ok === true && body.status === 'shared' &&
      (body.reaction === undefined || (typeof body.reaction === 'string' && body.reaction.length <= 500))) {
      return { kind: 'shared', replayed: body.replayed, ...(!body.replayed && typeof body.reaction === 'string' ? { reaction: body.reaction } : {}) };
    }
    return { kind: 'uncertain' };
  }
  if ([400, 403, 404, 409, 422].includes(status) &&
    ['invalid_request', 'companion_required', 'item_required', 'item_not_supported'].includes(String(body.error))) return { kind: 'rejected', code: String(body.error) };
  // In particular, target mismatch must not authorize a fresh key that could duplicate a share.
  return { kind: 'uncertain' };
}

/** Aborting a request is NOT proof that the server rolled it back. */
export async function sendMoonberryShare(intent: ShareIntent, options: {
  ownerId: string; fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number;
}): Promise<ShareOutcome> {
  if (!UUID.test(options.ownerId)) return { kind: 'unauthorized' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const interrupted = new Promise<ShareOutcome>((resolve) => {
    abort = () => { controller.abort(); resolve({ kind: 'uncertain' }); };
    timer = setTimeout(abort, options.timeoutMs ?? MOONBERRY_SHARE_TIMEOUT_MS);
    options.signal?.addEventListener('abort', abort, { once: true });
  });
  if (options.signal?.aborted) abort();
  const request = async (): Promise<ShareOutcome> => {
    if (controller.signal.aborted) return { kind: 'uncertain' };
    try {
      const response = await (options.fetcher ?? fetch)('/api/items/moonberry/share', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-memvoya-owner-id': options.ownerId.toLowerCase() },
        body: JSON.stringify({ action: 'share_moonberry', ...intent }), signal: controller.signal
      });
      if (response.status === 401) return { kind: 'unauthorized' };
      return parseShareOutcome(response.status, await response.json(), intent);
    } catch { return { kind: 'uncertain' }; }
  };
  try { return await Promise.race([request(), interrupted]); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
