// Synthetic fixture state only. No credentials, accounts, hosted requests, or database.
import type { StoryJournalRow } from '../../../src/lib/items/story';
export const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const ownerId = id(1), firstId = id(2), secondId = id(5), mossId = id(3), fernId = id(7);
export const companions = [{ id: mossId, name: 'Moss' }, { id: fernId, name: 'Fern' }];
const item = { id: id(4), item_key: 'world-moonberry', title: 'Moonberry', description: 'A small, luminous berry gathered in The Wilds.', kind: 'consumable', tone: 'world', visual_key: 'moonberry', capabilities: ['consumable', 'giftable', 'keepsake'] };
const owned = { id: firstId, owner_id: ownerId, companion_id: mossId, quantity: 1, source_type: 'world', source_key: 'moonberry-bush', acquired_at: '2026-10-03T10:00:00Z', companion: companions[0], item, provenance_json: { worldEventId: id(40), mapId: 'wilds-exploration', nodeId: 'moonberry-bush', ruleVersion: 'world-gather-v1' } };
const key = 'synthetic:moonberry-share-fixture:v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Intent = { requestId: string; userItemId: string; companionId: string; action: string };
type Mode = 'success' | 'hold' | 'failure' | 'timeout' | 'lost' | 'mismatched' | 'unauthorized' | 'rejected' | 'empty';
type State = {
  stacks: typeof owned[]; journal: StoryJournalRow[]; bindings: { eventId: string; userItemId: string; companionId: string }[];
  receipts: Record<string, any>; calls: Intent[]; mutations: number; refreshes: number; mode: Mode;
  refreshMode: 'success' | 'failure' | 'hold'; reaction: boolean; memory: boolean; authenticatedOwnerId: string; log: any[];
};
const initial: State = { stacks: [clone(owned), { ...clone(owned), id: secondId, companion_id: fernId, companion: companions[1], quantity: 3, acquired_at: '2026-10-04T10:00:00Z', provenance_json: { ...owned.provenance_json, worldEventId: id(41) } }], journal: [], bindings: [], receipts: {}, calls: [], mutations: 0, refreshes: 0, mode: 'success', refreshMode: 'success', reaction: true, memory: true, authenticatedOwnerId: ownerId, log: [] };
export const state: State = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? clone(initial);
export const save = () => sessionStorage.setItem(key, JSON.stringify(state));
export const record = (event: string, details: unknown = null) => { state.log.push({ sequence: state.log.length + 1, event, details }); save(); };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function commit(request: Intent) {
  const prior = state.receipts[request.requestId];
  if (prior) {
    if (prior.userItemId !== request.userItemId || prior.companionId !== request.companionId) return { body: { error: 'request_target_mismatch' }, status: 409 };
    return { body: { ...prior, replayed: true, reaction: undefined }, status: prior.status === 'empty' ? 409 : 200 };
  }
  const stack = state.stacks.find((row) => row.id === request.userItemId);
  if (!stack) return { body: { error: 'item_required' }, status: 404 };
  if (!companions.some((row) => row.id === request.companionId)) return { body: { error: 'companion_required' }, status: 404 };
  const name = companions.find((row) => row.id === request.companionId)!.name;
  const shared = stack.quantity > 0;
  if (shared) { stack.quantity -= 1; state.mutations += 1; }
  const body = { ...request, ok: shared, status: shared ? 'shared' : 'empty', quantityAfter: stack.quantity, replayed: false, ...(shared && state.reaction ? { reaction: `${name} receives it gently.` } : {}) };
  state.receipts[request.requestId] = body;
  if (shared && state.memory) {
    const eventId = id(100 + state.mutations), momentId = id(200 + state.mutations);
    state.bindings.push({ eventId, userItemId: stack.id, companionId: request.companionId });
    state.journal.push({ id: momentId, owner_id: ownerId, companion_id: request.companionId, source_type: 'system', source_id: eventId, title: `A Moonberry shared with ${name}`, body: `You shared one Moonberry with ${name}.`, created_at: '2026-10-06T04:00:00Z', meta_json: { category: 'item_use', action: 'share_moonberry', itemKey: 'world-moonberry', userItemId: stack.id, quantity: 1, ruleVersion: 'moonberry-share-v1' } });
  }
  record(shared ? 'synthetic_commit' : 'synthetic_empty_receipt', body);
  return { body, status: shared ? 200 : 409 };
}
let held: (() => void) | undefined;
export async function fetchShare(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || url.pathname !== '/api/items/moonberry/share' || init?.method !== 'POST') throw new Error('Fixture forbids every fetch except its synthetic share endpoint.');
  const request: Intent = JSON.parse(String(init.body));
  const requestedOwnerId = new Headers(init.headers).get('x-memvoya-owner-id');
  state.calls.push(clone(request)); record('synthetic_request', { request, mode: state.mode, requestedOwnerId, authenticatedOwnerId: state.authenticatedOwnerId });
  if (requestedOwnerId !== state.authenticatedOwnerId) return response({ error: 'account_changed' }, 401);
  if (state.mode === 'failure') return response({ error: 'injected_failure' }, 500);
  if (state.mode === 'unauthorized') return response({ error: 'unauthorized' }, 401);
  if (state.mode === 'rejected') return response({ error: 'companion_required' }, 404);
  if (state.mode === 'mismatched') return response({ ...request, userItemId: secondId, ok: true, status: 'shared', quantityAfter: 0, replayed: false });
  if (state.mode === 'timeout') return new Promise(() => {});
  if (state.mode === 'empty') { state.stacks.find((row) => row.id === request.userItemId)!.quantity = 0; }
  if (state.mode === 'hold') await new Promise<void>((resolve) => { held = resolve; });
  const result = commit(request);
  if (state.mode === 'lost') return new Promise(() => {});
  return response(result.body, result.status);
}
let refreshHandler: (() => Promise<void>) | undefined;
let heldRefresh: (() => void) | undefined;
export const setRefreshHandler = (callback: () => Promise<void>) => { refreshHandler = callback; };
export async function refresh() {
  state.refreshes += 1; record('synthetic_refresh', { mode: state.refreshMode });
  if (state.refreshMode === 'failure') throw new Error('Injected collection refresh failure');
  if (state.refreshMode === 'hold') await new Promise<void>((resolve) => { heldRefresh = resolve; });
  await refreshHandler?.();
}
export const fixture = {
  snapshot: () => clone(state),
  configure: (options: Partial<Pick<State, 'mode' | 'refreshMode' | 'reaction' | 'memory' | 'authenticatedOwnerId'>>) => { Object.assign(state, options); record('fixture_configuration', options); },
  release: () => { const resolve = held; held = undefined; resolve?.(); },
  refill: (userItemId = firstId, quantity = 2) => { state.stacks.find((row) => row.id === userItemId)!.quantity += quantity; record('synthetic_refill', { userItemId, quantity }); },
  refresh,
  releaseRefresh: () => { const resolve = heldRefresh; heldRefresh = undefined; resolve?.(); },
  unmount: async () => {}, mount: async () => {},
  setCompanions: async (_ids: string[]) => {},
  hideMemory: async () => {},
  removeStack: (userItemId = firstId) => { state.stacks = state.stacks.filter((row) => row.id !== userItemId); record('synthetic_stack_removed', { userItemId }); },
};
(window as any).__moonberryFixture = fixture;
save();
