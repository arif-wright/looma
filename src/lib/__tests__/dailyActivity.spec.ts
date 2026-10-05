import { describe, expect, it, vi } from 'vitest';
import { dailyActivityEvidence } from '../companions/dailyActivity';

vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('$lib/server/memorySummary', () => ({ upsertCompanionMemorySummary: vi.fn() }));
vi.mock('$lib/server/notifications', () => ({ createCompanionDigestNotification: vi.fn() }));
import { deriveDailyCompanionArc, deriveDailyCompanionArcRecap, syncDailyCompanionArcProgress } from '$lib/server/companions/journal';

const now = new Date('2026-09-08T18:00:00Z');
const today = '2026-09-08T12:00:00Z';
const checkin = { created_at: today, source_type: 'system', meta_json: { generatedBy: 'home_reconnect' } };
const arc = (care: any[] = [], journal: any[] = []) => deriveDailyCompanionArc({
  companionName: 'Root', rituals: [], ...dailyActivityEvidence(care, journal, now)
});

describe('daily activity evidence and recap', () => {
  it('does not count yesterday, future dates, invalid dates, or automatic notices', () => {
    const excluded = ['2026-09-07T23:59:59Z', '2026-09-09T00:00:00Z', 'invalid'];
    const evidence = dailyActivityEvidence(excluded.map(created_at => ({ created_at })), [
      ...excluded.map(created_at => ({ ...checkin, created_at })),
      { created_at: today, source_type: 'system', meta_json: { generatedBy: 'chapter_reward_reveal' } }
    ], now);
    expect(Object.values(evidence)).toEqual([false, false, false, false]);
  });

  it('keeps a first check-in and placement below the recap threshold', () => {
    const firstDay = arc([], [checkin, { created_at: today, meta_json: { category: 'sanctuary' } }]);
    expect(firstDay.progressLabel).toBe('2/4 complete');
    expect(deriveDailyCompanionArcRecap({ companionName: 'Root', arc: firstDay })).toBeNull();
  });

  it('summarizes recorded steps without interpreting a keepsake as evidence', () => {
    const recap = deriveDailyCompanionArcRecap({
      companionName: 'Root', arc: arc([{ created_at: today }], [checkin]),
      chapter: { title: 'Care Lantern', tone: 'care' }, premiumStyle: 'gilded_dawn'
    });
    expect(recap?.body).toContain('a check-in, a care activity, a journal entry');
    expect(recap?.body).not.toMatch(/social|whole day|Lantern|honestly|gilded/);
    expect(recap?.title).not.toMatch(/night/);
  });

  it('includes only the social step when that is the additional recorded activity', () => {
    const recap = deriveDailyCompanionArcRecap({ companionName: 'Root', arc: arc([], [checkin, { created_at: today, source_type: 'message' }]) });
    expect(recap?.body).toContain('a shared social moment');
    expect(recap?.body).not.toContain('a care activity');
  });

  it('preserves a stored legacy recap but does not display it as current evidence', async () => {
    const stored = { recap_unlocked_at: today, recap_title: 'Old care chapter', recap_body: 'The whole day was steady care.' };
    const upsert = vi.fn(async (_row: unknown) => ({ error: null }));
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: stored, error: null }), upsert };
    const result = await syncDailyCompanionArcProgress({ from: () => query } as any, {
      ownerId: 'test-owner', companionId: 'test-companion', companionName: 'Root', arc: arc([], [checkin])
    });
    expect(result.recap).toBeNull();
    expect(upsert.mock.calls[0]?.[0]).toMatchObject(stored);
  });
});
