import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetShareIntent, parseShareOutcome, readShareIntent, rememberShareIntent, sendMoonberryShare, type ShareIntent } from '$lib/items/moonberryShareClient';
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner = id(1);
const intent: ShareIntent = { requestId: id(2), userItemId: id(3), companionId: id(4) };
const result = (overrides: object = {}) => ({ ok: true, status: 'shared', ...intent, quantityAfter: 0, replayed: false, reaction: 'Moss receives it gently.', ...overrides });
const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
afterEach(() => { vi.useRealTimers(); });

describe('Moonberry share intent storage', () => {
  it('persists only request and target identifiers, isolates accounts, and never replaces unresolved intent', () => {
    const saved = storage();
    expect(rememberShareIntent(saved, owner, { ...intent, reaction: 'secret' } as ShareIntent)).toBe(true);
    expect(readShareIntent(saved, owner)).toEqual({ state: 'ready', intent });
    expect([...saved.values.values()][0]).toBe(JSON.stringify(intent));
    expect(readShareIntent(saved, id(99))).toEqual({ state: 'ready', intent: null });
    for (const other of [{ ...intent, userItemId: id(40) }, { ...intent, companionId: id(50) }, { ...intent, requestId: id(60) }]) {
      expect(rememberShareIntent(saved, owner, other)).toBe(false);
      expect(forgetShareIntent(saved, owner, other)).toBe(false);
    }
    expect(rememberShareIntent(saved, owner, intent)).toBe(true);
    expect(forgetShareIntent(saved, owner, intent)).toBe(true);
    expect(readShareIntent(saved, owner)).toEqual({ state: 'ready', intent: null });
  });
  it('normalizes persisted UUID casing for component recovery', () => {
    const saved = storage();
    const upper = { requestId: 'ABCDEFAB-0000-0000-0000-000000000001', userItemId: 'ABCDEFAB-0000-0000-0000-000000000002', companionId: 'ABCDEFAB-0000-0000-0000-000000000003' };
    expect(rememberShareIntent(saved, owner, upper)).toBe(true);
    expect(readShareIntent(saved, owner)).toEqual({ state: 'ready', intent: Object.fromEntries(Object.entries(upper).map(([key, value]) => [key, value.toLowerCase()])) });
  });
  it('fails closed for corrupted, unavailable, or unwritable storage', () => {
    const saved = storage(); rememberShareIntent(saved, owner, intent);
    saved.values.set([...saved.values.keys()][0]!, '{oops');
    expect(readShareIntent(saved, owner)).toEqual({ state: 'unavailable' });
    expect(rememberShareIntent(saved, owner, intent)).toBe(false);
    const blocked = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
    expect(readShareIntent(blocked, owner)).toEqual({ state: 'unavailable' });
    expect(rememberShareIntent(blocked, owner, intent)).toBe(false);
    expect(forgetShareIntent(blocked, owner, intent)).toBe(false);
    expect(rememberShareIntent({ ...storage(), setItem: () => {} }, owner, intent)).toBe(false);
    expect(readShareIntent(storage(), 'not-an-owner')).toEqual({ state: 'unavailable' });
  });
});

describe('strict Moonberry terminal receipts', () => {
  it('accepts a fresh receipt but exposes no historical quantity as current stock', () => {
    expect(parseShareOutcome(200, result(), intent)).toEqual({ kind: 'shared', replayed: false, reaction: 'Moss receives it gently.' });
    expect(parseShareOutcome(200, result({ replayed: true }), intent)).toEqual({ kind: 'shared', replayed: true });
    expect(parseShareOutcome(409, result({ ok: false, status: 'empty' }), intent)).toEqual({ kind: 'empty' });
  });
  it.each([
    null, [], {}, result({ requestId: id(99) }), result({ userItemId: id(99) }), result({ companionId: id(99) }),
    result({ quantityAfter: -1 }), result({ quantityAfter: 0.5 }), result({ quantityAfter: '0' }),
    result({ quantityAfter: Number.MAX_SAFE_INTEGER + 1 }), result({ replayed: undefined }),
    result({ status: 'wrong' }), result({ ok: false }), result({ reaction: {} }), result({ reaction: 'x'.repeat(501) })
  ])('keeps malformed or mismatched success uncertain (%j)', (body) => {
    expect(parseShareOutcome(200, body, intent)).toEqual({ kind: 'uncertain' });
  });
  it('matches UUID receipts independently of accepted input casing', () => {
    const upper = { requestId: 'ABCDEFAB-0000-0000-0000-000000000001', userItemId: 'ABCDEFAB-0000-0000-0000-000000000002', companionId: 'ABCDEFAB-0000-0000-0000-000000000003' };
    const lower = Object.fromEntries(Object.entries(upper).map(([key, value]) => [key, value.toLowerCase()]));
    expect(parseShareOutcome(200, result(lower), upper).kind).toBe('shared');
  });
  it('requires exact empty receipt and leaves target mismatch uncertain', () => {
    expect(parseShareOutcome(409, result({ status: 'empty', ok: false, quantityAfter: 2 }), intent).kind).toBe('uncertain');
    expect(parseShareOutcome(409, { error: 'request_target_mismatch' }, intent).kind).toBe('uncertain');
    expect(parseShareOutcome(500, result(), intent).kind).toBe('uncertain');
    expect(parseShareOutcome(401, {}, intent).kind).toBe('unauthorized');
    expect(parseShareOutcome(404, { error: 'companion_required' }, intent)).toEqual({ kind: 'rejected', code: 'companion_required' });
  });
});

describe('bounded explicit request transport', () => {
  it('sends one request with exact target and no owner; returning a result does not send another', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(result()), { status: 200 }));
    expect((await sendMoonberryShare(intent, { ownerId: owner, fetcher })).kind).toBe('shared');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/items/moonberry/share');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'share_moonberry', ...intent });
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toMatchObject({ 'x-memvoya-owner-id': owner });
  });
  it('times out a stalled fetch, aborts locally and never reissues; late success cannot change outcome', async () => {
    vi.useFakeTimers(); let finish!: (value: Response) => void;
    const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => { finish = resolve; }));
    const pending = sendMoonberryShare(intent, { ownerId: owner, fetcher });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual({ kind: 'uncertain' });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    finish(new Response(JSON.stringify(result())));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds response parsing and maps network/invalid JSON to uncertainty', async () => {
    expect(await sendMoonberryShare(intent, { ownerId: owner, fetcher: vi.fn(async () => { throw Error('lost'); }) })).toEqual({ kind: 'uncertain' });
    expect(await sendMoonberryShare(intent, { ownerId: owner, fetcher: vi.fn(async () => new Response('<html>broken')) })).toEqual({ kind: 'uncertain' });
    vi.useFakeTimers();
    const pending = sendMoonberryShare(intent, { ownerId: owner, fetcher: vi.fn(async () => ({ status: 200, json: () => new Promise(() => {}) }) as unknown as Response) });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual({ kind: 'uncertain' });
  });
  it('navigation abort is uncertain and an already-aborted request never sends', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
    const pending = sendMoonberryShare(intent, { ownerId: owner, fetcher, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ kind: 'uncertain' });
    const never = vi.fn();
    expect(await sendMoonberryShare(intent, { ownerId: owner, fetcher: never, signal: controller.signal })).toEqual({ kind: 'uncertain' });
    expect(never).not.toHaveBeenCalled();
  });
});
