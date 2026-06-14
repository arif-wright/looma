import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { VIEWER_CREDENTIALS, createAuthedRequest } from '../fixtures/auth';
import { runSeed, type SeedResult } from '../fixtures/env';

const admin = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.describe('Home presence repair API', () => {
  let seed: SeedResult;
  let companionId: string;

  test.beforeAll(async () => {
    seed = await runSeed();
    const { data, error } = await admin
      .from('companions')
      .select('id')
      .eq('owner_id', seed.viewer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Seed companion unavailable');
    companionId = data.id;
  });

  test.beforeEach(async () => {
    await admin.from('companion_stats').upsert(
      {
        companion_id: companionId,
        last_meaningful_interaction_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        repair_started_at: null,
        repair_completed_at: null
      },
      { onConflict: 'companion_id' }
    );
    await admin
      .from('companion_journal_entries')
      .delete()
      .eq('owner_id', seed.viewer.id)
      .eq('companion_id', companionId)
      .eq('meta_json->>category', 'repair');
  });

  test('sitting begins repair and staying completes it with one durable memory', async () => {
    const request = await createAuthedRequest(VIEWER_CREDENTIALS);

    const sit = await request.post('/api/home/presence', { data: { companionId, action: 'sit' } });
    expect(sit.status()).toBe(200);
    expect(await sit.json()).toMatchObject({ stateBefore: 'quiet', stateAfter: 'softening', memory: null });

    const stay = await request.post('/api/home/presence', { data: { companionId, action: 'stay' } });
    expect(stay.status()).toBe(200);
    const payload = await stay.json();
    expect(payload).toMatchObject({ stateBefore: 'softening', stateAfter: 'steady' });
    expect(payload.memory?.id).toBeTruthy();

    const { data: stats } = await admin
      .from('companion_stats')
      .select('repair_started_at, repair_completed_at, last_meaningful_interaction_at')
      .eq('companion_id', companionId)
      .single();
    expect(stats?.repair_started_at).toBeTruthy();
    expect(stats?.repair_completed_at).toBeTruthy();

    const { count } = await admin
      .from('companion_journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', seed.viewer.id)
      .eq('companion_id', companionId)
      .eq('meta_json->>category', 'repair');
    expect(count).toBe(1);
    await request.dispose();
  });

  test('rejects an action that does not match the current state', async () => {
    const request = await createAuthedRequest(VIEWER_CREDENTIALS);
    const response = await request.post('/api/home/presence', { data: { companionId, action: 'stay' } });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'invalid_presence_transition', currentState: 'quiet' });
    await request.dispose();
  });
});
