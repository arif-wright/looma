import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('$lib/server/memorySummary', () => ({ upsertCompanionMemorySummary: vi.fn() }));
vi.mock('$lib/server/notifications', () => ({ createCompanionDigestNotification: vi.fn() }));

import { deriveWeeklyCompanionArc, deriveChapterMilestones, deriveChapterRewards, loadChapterActivity, unlockChapterRewards } from '$lib/server/companions/journal';
import { supabaseAdmin } from '$lib/server/supabase';

const now = new Date('2026-09-08T18:00:00Z');
const arc = (dates: string[] = []) => deriveWeeklyCompanionArc({
  companionName: 'Root', activityDates: dates, careMoments: 1,
  missionMoments: 0, gameMoments: 0, socialMoments: 0, checkins: 1
});
const milestones = (weeklyArc: ReturnType<typeof arc>) => deriveChapterMilestones({
  companionName: 'Root', weeklyArc, bondLevel: 3, trust: 90, affection: 90, patternNotice: null
});
const rewards = (weeklyArc: ReturnType<typeof arc>) => deriveChapterRewards({
  companionName: 'Root', weeklyArc, milestones: milestones(weeklyArc), trust: 90, affection: 90
});

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('chapter history evidence', () => {
  it('does not turn starting stats or repeated activity in one day into an established chapter', () => {
    vi.useFakeTimers().setSystemTime(now);
    for (const dates of [[], ['2026-09-08T10:00:00Z'], Array(20).fill('2026-09-08T11:00:00Z')]) {
      expect(rewards(arc(dates))).toEqual([]);
      expect(milestones(arc(dates)).map(row => row.id)).toEqual(['chapter-week-care']);
      expect(arc(dates).body).not.toMatch(/repeated|consistency/);
    }
  });

  it('allows an established chapter after three distinct recorded days', () => {
    vi.useFakeTimers().setSystemTime(now);
    const history = arc(['2026-09-06', '2026-09-07', '2026-09-08']);
    expect(history.observedDays).toBe(3);
    expect(rewards(history).map(row => row.rewardKey)).toContain('chapter-care-lantern');
    expect(milestones(history).map(row => row.id)).toContain('chapter-bond-tier');
  });

  it('ignores invalid, old, and future dates', () => {
    vi.useFakeTimers().setSystemTime(now);
    expect(arc(['invalid', '2020-01-01', '2099-01-01', '2026-09-08']).observedDays).toBe(1);
  });

  it('scopes evidence to the owner and companion and excludes automatic notices', async () => {
    const queries: any[] = [];
    const client = { from: vi.fn((table: string) => {
      const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), gte: vi.fn(() => query), order: vi.fn(() => query),
        limit: vi.fn(async () => ({ error: null, data: table === 'companion_care_events' ? [] : [
          { created_at: '2026-09-08', source_type: 'system', meta_json: { generatedBy: 'home_reconnect' } },
          { created_at: '2026-09-07', source_type: 'system', meta_json: { generatedBy: 'chapter_reward_reveal' } }
        ] })) };
      queries.push(query); return query;
    }) };
    const result = await loadChapterActivity(client as any, 'test-owner', 'test-companion');
    expect(result.activityDates).toEqual(['2026-09-08']);
    expect(result.checkins).toBe(1);
    expect(result.missionMoments).toBe(0);
    for (const query of queries) {
      expect(query.eq).toHaveBeenCalledWith('owner_id', 'test-owner');
      expect(query.eq).toHaveBeenCalledWith('companion_id', 'test-companion');
    }
  });

  it('keeps previously earned rewards visible without granting a new reward', async () => {
    const earned = { reward_key: 'chapter-care-lantern', reward_title: 'Care Lantern', reward_body: 'Earned', reward_tone: 'care', unlocked_at: '2026-09-01' };
    const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query),
      then: (resolve: any) => Promise.resolve({ data: [earned], error: null }).then(resolve), upsert: vi.fn() };
    vi.mocked(supabaseAdmin.from).mockReturnValue({ select: () => ({ in: async () => ({ data: [], error: null }) }) } as any);
    const result = await unlockChapterRewards({ from: () => query } as any, { ownerId: 'test-owner', companionId: 'test-companion', rewards: [] });
    expect(result[0]?.rewardKey).toBe('chapter-care-lantern');
    expect(query.upsert).not.toHaveBeenCalled();
  });
});
