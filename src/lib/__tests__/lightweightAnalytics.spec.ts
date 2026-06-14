import { describe, expect, it } from 'vitest';
import { trackLightweightUsage } from '$lib/server/analytics/lightweight';

describe('lightweight analytics', () => {
  it('writes the required event type and maps session duration to dwell time', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        insert: async (payload: Record<string, unknown>) => {
          inserted = payload;
          return { error: null };
        }
      })
    };

    const result = await trackLightweightUsage({
      supabase: supabase as any,
      userId: 'user-1',
      type: 'session.end',
      payload: {
        pagesVisitedCount: 2,
        gamesPlayedCount: 0,
        durationMs: 42_000
      },
      sessionId: '00000000-0000-4000-8000-000000000001',
      consent: { memory: true, adaptation: true } as any
    });

    expect(result).toEqual({ tracked: true });
    expect(inserted).toMatchObject({
      event_type: 'session.end',
      kind: 'session.end',
      surface: 'events_ingest',
      payload: {
        pagesVisitedCount: 2,
        gamesPlayedCount: 0,
        dwellMs: 42_000
      },
      meta: {
        telemetry: 'lightweight',
        privacy: 'no_pii',
        pagesVisitedCount: 2,
        gamesPlayedCount: 0,
        dwellMs: 42_000
      }
    });
  });
});
