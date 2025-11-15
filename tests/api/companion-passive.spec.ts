import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { VIEWER_CREDENTIALS, createAuthedRequest } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const minusMinutes = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

test.describe('Companion passive tick API', () => {
  let seed: SeedResult;
  let companionId: string;

  const resetState = async ({
    affection = 60,
    trust = 55,
    energy = 30,
    lastPassiveMinutesAgo = 720,
    lastDailyMinutesAgo = 60
  } = {}) => {
    await adminClient
      .from('companions')
      .update({
        affection,
        trust,
        energy,
        mood: 'neutral'
      })
      .eq('id', companionId);

    await adminClient
      .from('companion_stats')
      .upsert(
        {
          companion_id: companionId,
          care_streak: 0,
          fed_at: null,
          played_at: null,
          groomed_at: null,
          last_passive_tick: minusMinutes(lastPassiveMinutesAgo),
          last_daily_bonus_at: minusMinutes(lastDailyMinutesAgo)
        },
        { onConflict: 'companion_id' }
      );

    await adminClient.from('companion_care_events').delete().eq('companion_id', companionId);
  };

  const fetchTick = async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.post('/api/companions/tick', { data: {} });
    const payload = await res.json();
    await viewerCtx.dispose();
    return { res, payload };
  };

  test.beforeAll(async () => {
    seed = await runSeed();
    const { data, error } = await adminClient
      .from('companions')
      .select('id')
      .eq('owner_id', seed.viewer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new Error(`Unable to locate viewer companion: ${error?.message ?? 'not found'}`);
    }

    companionId = data.id as string;
  });

  test('applies passive decay and logs a single event', async () => {
    await resetState();
    const beforeSnapshot = { affection: 60, trust: 55, energy: 30 };

    const { res, payload } = await fetchTick();
    expect(res.status()).toBe(200);

    const updated = (payload?.companions ?? []).find((row: { id: string }) => row.id === companionId);
    expect(updated).toBeTruthy();
    expect(updated.affection).toBe(beforeSnapshot.affection - 2);
    expect(updated.trust).toBe(beforeSnapshot.trust - 1);
    expect(updated.energy).toBe(beforeSnapshot.energy + 12);

    const passiveEvents = (payload?.newEvents ?? []).filter((evt: { kind: string }) => evt.kind === 'passive');
    expect(passiveEvents.length).toBeGreaterThanOrEqual(1);

    const repeat = await fetchTick();
    expect(repeat.res.status()).toBe(200);
    const secondPassive = (repeat.payload?.newEvents ?? []).filter((evt: { kind: string }) => evt.kind === 'passive');
    expect(secondPassive.length).toBe(0);
  });

  test('daily bonus triggers once per day', async () => {
    await resetState({ lastPassiveMinutesAgo: 30, lastDailyMinutesAgo: 24 * 60 + 10 });

    const first = await fetchTick();
    expect(first.res.status()).toBe(200);
    const dailyEvents = (first.payload?.newEvents ?? []).filter((evt: { kind: string }) => evt.kind === 'daily_bonus');
    expect(dailyEvents.length).toBeGreaterThanOrEqual(1);

    const afterFirst = (first.payload?.companions ?? []).find((row: { id: string }) => row.id === companionId);
    expect(afterFirst).toBeTruthy();

    const second = await fetchTick();
    expect(second.res.status()).toBe(200);
    const secondDaily = (second.payload?.newEvents ?? []).filter((evt: { kind: string }) => evt.kind === 'daily_bonus');
    expect(secondDaily.length).toBe(0);
    const afterSecond = (second.payload?.companions ?? []).find((row: { id: string }) => row.id === companionId);
    expect(afterSecond.affection).toBe(afterFirst.affection);
    expect(afterSecond.trust).toBe(afterFirst.trust);
    expect(afterSecond.energy).toBe(afterFirst.energy);
  });
});
