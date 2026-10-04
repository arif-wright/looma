import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supabase', () => ({ supabaseAdmin: {} }));
import { createAchievementEvaluator, type AchievementDefinition } from '$lib/server/achievements/evaluator';

const owner = '00000000-0000-0000-0000-000000000001';
const achievement: AchievementDefinition = {
  id: '00000000-0000-0000-0000-000000000002', key: 'first', name: 'First',
  description: 'A first clear', icon: 'trophy', rarity: 'common', points: 999999,
  game_id: null, rule: { kind: 'first_clear' }
};
const summary = {
  achievementId: achievement.id, key: 'trusted-key', name: 'Trusted title', icon: 'heart',
  points: 25, shards: 125, rarity: 'rare', meta: { sessionId: 'server-session' }
};
const settled = { data: { unlocked: true, ...summary }, error: null };
const existing = { data: { unlocked: false, reason: 'already_unlocked' }, error: null };
const fixture = () => {
  const rpc = vi.fn().mockResolvedValue(settled);
  const from = vi.fn(() => { throw new Error('No split reward writes are allowed'); });
  return { rpc, from, evaluator: createAchievementEvaluator({ supabase: { rpc, from } as any }) };
};
beforeEach(() => {
  vi.stubEnv('ECON_ACH_POINT_TO_SHARDS', '5');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('atomic achievement settlement caller', () => {
  it('passes only identity, private factor and metadata; returns fresh database catalog amounts', async () => {
    const { rpc, from, evaluator } = fixture();
    expect(await evaluator.unlock(owner, achievement, summary.meta)).toEqual(summary);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_settle_achievement_reward', {
      p_user: owner, p_achievement: achievement.id, p_shard_factor: 5, p_meta: summary.meta
    });
    expect(from).not.toHaveBeenCalled();
    expect(await evaluator.userHas(owner, achievement.id)).toBe(true);
  });

  it('preserves the existing server conversion factor', async () => {
    const { rpc, evaluator } = fixture();
    vi.stubEnv('ECON_ACH_POINT_TO_SHARDS', '7');
    await evaluator.unlock(owner, achievement, {});
    expect(rpc.mock.calls[0]?.[1].p_shard_factor).toBe(7);
  });

  it('treats already-unlocked legacy/retried claims as no-op and caches only that acknowledgement', async () => {
    const { rpc, from, evaluator } = fixture();
    rpc.mockResolvedValue(existing);
    expect(await evaluator.unlock(owner, achievement, {})).toBeNull();
    expect(await evaluator.userHas(owner, achievement.id)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates settlement errors without caching or compensating, then permits a clean retry', async () => {
    const { rpc, evaluator } = fixture();
    const failure = { message: 'point update failed' };
    rpc.mockResolvedValueOnce({ data: null, error: failure });
    await expect(evaluator.unlock(owner, achievement, {})).rejects.toEqual(failure);
    await expect(evaluator.userHas(owner, achievement.id)).rejects.toThrow('No split reward writes');
    expect(await evaluator.unlock(owner, achievement, summary.meta)).toEqual(summary);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not compensate after a committed response is lost; retry accepts the database no-op', async () => {
    const { rpc, from, evaluator } = fixture();
    rpc.mockRejectedValueOnce(new Error('network response lost')).mockResolvedValueOnce(existing);
    await expect(evaluator.unlock(owner, achievement, {})).rejects.toThrow('network response lost');
    expect(await evaluator.unlock(owner, achievement, {})).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    null, {}, { unlocked: false }, { unlocked: false, reason: 'unknown' },
    { ...settled.data, achievementId: 'foreign' }, { ...settled.data, points: -1 },
    { ...settled.data, points: '25' }, { ...settled.data, shards: Infinity },
    { ...settled.data, shards: Number.MAX_SAFE_INTEGER + 1 },
    { ...settled.data, meta: null }, { ...settled.data, meta: [] },
    { ...settled.data, rarity: 'invented' }, { ...settled.data, rarity: ['rare'] }
  ])('rejects malformed acknowledgement without caching: %j', async (data) => {
    const { rpc, evaluator } = fixture();
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(evaluator.unlock(owner, achievement, {})).rejects.toThrow('achievement_reward_invalid_response');
    await expect(evaluator.userHas(owner, achievement.id)).rejects.toThrow('No split reward writes');
    expect(await evaluator.unlock(owner, achievement, summary.meta)).toEqual(summary);
  });

  it('hands overlapping eligible calls to the database key and reports only the winner', async () => {
    const { rpc, evaluator } = fixture();
    // Both app calls reach the mock before it resolves. Real PostgreSQL competing
    // sessions are a separate verification requirement, not simulated here.
    const waiting: Array<(value: unknown) => void> = [];
    rpc.mockImplementation(() => new Promise((resolve) => waiting.push(resolve)));
    const pending = [evaluator.unlock(owner, achievement, {}), evaluator.unlock(owner, achievement, {})];
    expect(waiting).toHaveLength(2);
    waiting[0]!(settled);
    waiting[1]!(existing);
    expect(await Promise.all(pending)).toEqual([summary, null]);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it('does not call settlement for an empty owner', async () => {
    const { rpc, evaluator } = fixture();
    expect(await evaluator.unlock('', achievement, {})).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
