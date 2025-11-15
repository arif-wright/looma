import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { VIEWER_CREDENTIALS, createAuthedRequest } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const GOAL_DATE = () => new Date().toISOString().slice(0, 10);

test.describe('Companion care API', () => {
  let seed: SeedResult;
  let companionId: string;

  const fetchCompanion = async () => {
    const { data, error } = await adminClient
      .from('companions')
      .select('affection, trust, energy')
      .eq('id', companionId)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Failed to fetch companion: ${error?.message ?? 'unknown'}`);
    }
    return data;
  };

  const resetCompanion = async (overrides?: { affection?: number; trust?: number; energy?: number }) => {
    await adminClient
      .from('companions')
      .update({
        affection: overrides?.affection ?? 40,
        trust: overrides?.trust ?? 35,
        energy: overrides?.energy ?? 80,
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
          groomed_at: null
        },
        { onConflict: 'companion_id' }
      );

    await adminClient.from('companion_care_events').delete().eq('companion_id', companionId);
    await adminClient
      .from('companion_daily_goals')
      .delete()
      .eq('owner_id', seed.viewer.id)
      .eq('action_date', GOAL_DATE());
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
      throw new Error(`Unable to locate seed companion: ${error?.message ?? 'not found'}`);
    }

    companionId = data.id as string;
  });

  test.beforeEach(async () => {
    await resetCompanion();
  });

  test('feed bumps stats and logs care event', async () => {
    const before = await fetchCompanion();
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    const res = await viewerCtx.post('/api/companions/care', {
      data: { companionId, action: 'feed' }
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload?.companion?.affection).toBe(before.affection + 5);
    expect(payload?.companion?.trust).toBe(before.trust + 2);
    expect(payload?.companion?.energy).toBe(before.energy + 15);
    expect(payload?.event?.action).toBe('feed');
    await viewerCtx.dispose();
  });

  test('actions blocked when energy is depleted', async () => {
    await resetCompanion({ energy: 0 });
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    const res = await viewerCtx.post('/api/companions/care', {
      data: { companionId, action: 'play' }
    });

    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe('low_energy');
    await viewerCtx.dispose();
  });

  test('mood logic switches to happy when thresholds exceeded', async () => {
    await resetCompanion({ affection: 72, trust: 65, energy: 60 });
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    const res = await viewerCtx.post('/api/companions/care', {
      data: { companionId, action: 'play' }
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload?.companion?.mood).toBe('happy');
    await viewerCtx.dispose();
  });
});
