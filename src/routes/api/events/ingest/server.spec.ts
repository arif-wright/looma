import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  getAdminClient: vi.fn(),
  claimReceipt: vi.fn(),
  dispatchEvent: vi.fn(),
  trackUsage: vi.fn()
}));

vi.mock('$lib/server/supabase', () => ({
  createSupabaseServerClient: mocks.createRequestClient,
  tryGetSupabaseAdminClient: mocks.getAdminClient
}));
vi.mock('$lib/server/events/idempotency', () => ({
  deriveEventIdempotencyKey: ({ meta }: { meta: Record<string, unknown> }) =>
    typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : null,
  claimEventIngestReceipt: mocks.claimReceipt
}));
vi.mock('$lib/server/analytics/lightweight', () => ({ trackLightweightUsage: mocks.trackUsage }));
vi.mock('$lib/server/agents', () => ({
  agentRegistry: {},
  dispatchEvent: mocks.dispatchEvent
}));
vi.mock('$lib/server/context/getContextBundle', () => ({ getContextBundle: vi.fn().mockResolvedValue({}) }));
vi.mock('$lib/server/agents/traceStore', () => ({ addTrace: vi.fn() }));
vi.mock('$lib/server/consent', () => ({
  getConsentFlags: vi.fn().mockResolvedValue({ memory: false, adaptation: false })
}));
vi.mock('$lib/server/context/worldState', () => ({
  applyWorldStateBoundary: vi.fn(),
  markWorldWhisperShown: vi.fn()
}));
vi.mock('$lib/server/context/portableSync', () => ({ syncPortableState: vi.fn() }));
vi.mock('$lib/server/emotionalState', () => ({ applyEventToEmotionalState: vi.fn() }));
vi.mock('$lib/server/memorySummary', () => ({ upsertCompanionMemorySummary: vi.fn() }));
vi.mock('$lib/server/rateLimit', () => ({
  consumeApiRateLimit: vi.fn().mockResolvedValue({ allowed: true })
}));
vi.mock('$lib/server/tuning/config', () => ({
  getLoomaTuningConfig: vi.fn().mockResolvedValue({
    milestones: {
      companion: { streak3: 3, games5: 5, firstWeekActive: 7 },
      museEvolution: {
        harmonae: { streakDays: 3, gamesPlayed: 5 },
        mirae: { streakDays: 7, gamesPlayed: 10 }
      }
    }
  })
}));

import { POST } from './+server';

const requestClient = { from: vi.fn(), auth: { getUser: vi.fn() } };
const adminClient = { from: vi.fn() };
const serviceRoleKey = 'test-service-role-key-that-must-not-leak';

const makeEvent = () =>
  ({
    request: new Request('http://localhost/api/events/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'preference.toggle',
        payload: { enabled: true },
        meta: { idempotencyKey: 'receipt-1' }
      })
    }),
    locals: {},
    getClientAddress: () => '127.0.0.1'
  }) as any;

describe('POST /api/events/ingest receipt handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRequestClient.mockResolvedValue({
      supabase: requestClient,
      session: { user: { id: 'user-1' } }
    });
    mocks.getAdminClient.mockReturnValue(adminClient);
    mocks.claimReceipt.mockResolvedValue({ duplicate: false });
    mocks.dispatchEvent.mockResolvedValue({
      vetoed: false,
      event: { id: 'trace-1' },
      results: []
    });
  });

  it('authenticates with the request client but claims with the admin client', async () => {
    const response = await POST(makeEvent());

    expect(response.status).toBe(200);
    expect(mocks.createRequestClient).toHaveBeenCalledOnce();
    expect(mocks.claimReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: adminClient, userId: 'user-1' })
    );
    expect(mocks.claimReceipt).not.toHaveBeenCalledWith(
      expect.objectContaining({ supabase: requestClient })
    );
    expect(mocks.dispatchEvent).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ ok: true, traceId: 'trace-1' });
  });

  it('fails closed when the admin client is unavailable', async () => {
    mocks.getAdminClient.mockReturnValue(null);

    const response = await POST(makeEvent());

    expect(response.status).toBe(503);
    expect(mocks.claimReceipt).not.toHaveBeenCalled();
    expect(mocks.dispatchEvent).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(serviceRoleKey);
  });

  it('returns the existing successful deduplicated response for 23505 results', async () => {
    mocks.claimReceipt.mockResolvedValue({ duplicate: true });

    const response = await POST(makeEvent());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deduped: true,
      vetoed: false,
      output: null,
      actions: [],
      traceId: null
    });
    expect(mocks.dispatchEvent).not.toHaveBeenCalled();
  });

  it('sanitizes receipt failures and prevents downstream processing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.claimReceipt.mockRejectedValue({ code: '42501', message: serviceRoleKey });

    const response = await POST(makeEvent());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'service_unavailable' });
    expect(JSON.stringify(body)).not.toContain(serviceRoleKey);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(serviceRoleKey);
    expect(mocks.dispatchEvent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns 400 'Unsupported event type' when the payload is missing type and does not call any downstream clients", async () => {
    const badRequest = {
      request: new Request('http://localhost/api/events/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { foo: 'bar' }, meta: { idempotencyKey: 'receipt-1' } })
      }),
      locals: {},
      getClientAddress: () => '127.0.0.1'
    } as any;

    const response = await POST(badRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported event type' });

    // Ensure no upstream/downstream side-effects or clients were used
    expect(mocks.createRequestClient).not.toHaveBeenCalled();
    expect(mocks.getAdminClient).not.toHaveBeenCalled();
    expect(mocks.claimReceipt).not.toHaveBeenCalled();
    expect(mocks.dispatchEvent).not.toHaveBeenCalled();
  });
});
