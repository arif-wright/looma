import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { sync, getAdmin } = vi.hoisted(() => ({ sync: vi.fn(), getAdmin: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(async (event: any) => event.locals),
  tryGetSupabaseAdminClient: getAdmin
}));
vi.mock('$lib/server/companions/bonds', () => ({ syncPlayerBondState: sync }));
vi.mock('$lib/server/events/ingest', () => ({ ingestServerEvent: vi.fn(async () => null) }));
vi.mock('$lib/server/companions/rituals', () => ({ incrementCompanionRitual: vi.fn(async () => null) }));
vi.mock('$lib/server/rateLimit', () => ({ consumeApiRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('$lib/server/companions/journal', () => ({ appendCompanionJournalEntry: vi.fn(async () => ({ ok: true,
  entry: { id: 'memory-1', created_at: '2026-10-04T00:00:00Z' } })) }));
vi.mock('$lib/server/companionPersonalization', () => ({ getCompanionPersonalization: vi.fn(async () => null) }));
vi.mock('$lib/companions/personalization', () => ({ personalizeReconnectFallback: (text: string) => text }));
import { POST } from '../../routes/api/home/reconnect/+server';

const fixture = (authenticated = true, foreignCompanion = false) => {
  const companion = { id: 'companion-1', owner_id: foreignCompanion ? 'other-owner' : 'owner-1', name: 'Moss',
    affection: 50, trust: 50, energy: 50, mood: 'calm', stats: null, first_bond_completed_at: '2026-10-01T00:00:00Z' };
  const admin = { from: vi.fn((table: string) => {
    let payload: Record<string, unknown> = {};
    const result = () => ({ error: null, data: table === 'companions' ? { ...companion, ...payload }
      : table === 'user_daily_checkins' ? { id: 'checkin-1', created_at: '2026-10-04T00:00:00Z' }
      : table === 'companion_chapter_rewards' ? [] : null });
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      upsert: () => q, update: (value: Record<string, unknown>) => { payload = value; return q; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return q;
  }) };
  const sessionClient = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };
  getAdmin.mockReturnValue(admin);
  const event = { locals: { supabase: sessionClient, session: authenticated ? { user: { id: 'owner-1' } } : null },
    request: new Request('http://localhost/api/home/reconnect', { method: 'POST', body: JSON.stringify({
      companionId: companion.id, mood: 'calm', reflection: 'A quiet moment today.'
    }) }) };
  return { event, admin, sessionClient };
};
beforeEach(() => { vi.clearAllMocks(); sync.mockResolvedValue({ rows: [], milestones: [] }); vi.spyOn(console,'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

it('passes the session client into bond authentication while data writes use the distinct admin client', async () => {
  const { event, admin, sessionClient } = fixture();
  const response = await POST(event as any);
  expect(response.status).toBe(200);
  expect((await response.json()).sideEffects.companionStatsSynced).toBe(true);
  expect(admin.from).toHaveBeenCalledWith('companion_stats');
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledWith(sessionClient, 'owner-1');
  expect(sync.mock.calls[0]?.[0]).not.toBe(admin);
});
it('rejects missing session and foreign companion before any bond synchronization', async () => {
  expect((await POST(fixture(false).event as any)).status).toBe(401);
  expect((await POST(fixture(true,true).event as any)).status).toBe(403);
  expect(sync).not.toHaveBeenCalled();
});
it('keeps existing best-effort failure reporting when the authenticated bond boundary rejects', async () => {
  const { event, sessionClient } = fixture();
  sync.mockRejectedValueOnce(new Error('bond_authentication_required'));
  const response = await POST(event as any);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.sideEffects.companionStatsSynced).toBe(false);
  expect(body.memory.id).toBe('memory-1');
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledWith(sessionClient, 'owner-1');
  expect(console.error).toHaveBeenCalledWith('[side-effect] home/reconnect:companion_stats failed', expect.any(Error));
});
