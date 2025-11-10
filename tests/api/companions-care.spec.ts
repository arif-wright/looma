import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { VIEWER_CREDENTIALS, createAuthedRequest } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.describe('Companion care API', () => {
  let seed: SeedResult;
  let companionId: string;

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

  test('care action updates companion state', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.post('/api/companions/care', {
      data: { companionId, action: 'feed' }
    });

    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload?.state?.affection).toBeGreaterThanOrEqual(0);
    await viewerCtx.dispose();
  });
});
