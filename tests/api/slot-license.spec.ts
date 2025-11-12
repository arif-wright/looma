import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.describe.serial('Slot license API', () => {
  let seed: SeedResult;
  let licenseItemId: string;

  test.beforeAll(async () => {
    seed = await runSeed();
    const { data, error } = await adminClient
      .from('shop_items')
      .select('id')
      .eq('slug', 'slot-license')
      .maybeSingle();

    if (error || !data) {
      throw new Error(`slot-license item missing: ${error?.message ?? 'not found'}`);
    }

    licenseItemId = data.id as string;
  });

  test.beforeEach(async () => {
    await adminClient
      .from('player_companion_slots')
      .upsert({ user_id: seed.viewer.id, max_slots: 3, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    await adminClient
      .from('shop_inventory')
      .delete()
      .eq('user_id', seed.viewer.id)
      .eq('item_id', licenseItemId);
  });

  test('rejects when no license', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.post('/api/companions/slots/license');
    expect(res.status()).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBeTruthy();
    await viewerCtx.dispose();
  });

  test('consumes a license and unlocks a slot', async () => {
    await adminClient
      .from('shop_inventory')
      .insert({ user_id: seed.viewer.id, item_id: licenseItemId, stackable: true });

    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.post('/api/companions/slots/license');
    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.maxSlots).toBeGreaterThanOrEqual(4);
    await viewerCtx.dispose();

    const { count } = await adminClient
      .from('shop_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', seed.viewer.id)
      .eq('item_id', licenseItemId);
    expect(count ?? 0).toBe(0);
  });
});
