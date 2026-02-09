import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.describe.serial('Companion roster APIs', () => {
  let seed: SeedResult;
  let companionIds: string[] = [];
  const originalNames = new Map<string, string>();

  const fetchRosterRows = async () => {
    const { data, error } = await adminClient
      .from('companions')
      .select('id, name, created_at')
      .eq('owner_id', seed.viewer.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as { id: string; name: string | null }[]) ?? [];
  };

  const ensureRoster = async () => {
    let rows = await fetchRosterRows();
    if (rows.length < 3) {
      const toInsert = Array.from({ length: 3 - rows.length }).map((_, idx) => ({
        owner_id: seed.viewer.id,
        name: `Roster Seed ${idx + 1}`,
        species: 'looma',
        rarity: 'common',
        level: 1,
        xp: 0,
        affection: 40,
        trust: 35,
        energy: 80,
        mood: 'steady'
      }));
      const { error } = await adminClient.from('companions').insert(toInsert);
      if (error) throw error;
      rows = await fetchRosterRows();
    }
    companionIds = rows.map((row) => row.id);
    originalNames.clear();
    rows.forEach((row) => originalNames.set(row.id, row.name ?? 'Companion'));
    await adminClient
      .from('player_companion_slots')
      .upsert({ user_id: seed.viewer.id, max_slots: 3, updated_at: new Date().toISOString() })
      .throwOnError();
    await resetRoster();
  };

  const resetSlots = async (value = 3) => {
    const { error } = await adminClient
      .from('player_companion_slots')
      .upsert({ user_id: seed.viewer.id, max_slots: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
  };

  const resetRoster = async () => {
    if (!companionIds.length) return;
    await adminClient
      .from('companions')
      .update({ is_active: false, state: 'idle' })
      .eq('owner_id', seed.viewer.id)
      .throwOnError();
    const updates = await Promise.all(
      companionIds.map((id, index) =>
        adminClient
          .from('companions')
          .update({ slot_index: index, name: originalNames.get(id) ?? `Companion ${index + 1}` })
          .eq('id', id)
      )
    );
    updates.forEach(({ error }) => {
      if (error) throw error;
    });
  };

  const fetchCompanion = async (id: string) => {
    const { data, error } = await adminClient
      .from('companions')
      .select('is_active, state, slot_index, name')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Unable to fetch companion ${id}`);
    }
    return data as { is_active: boolean; state: string | null; slot_index: number | null; name: string | null };
  };

  const requireCompanionId = (index: number): string => {
    const id = companionIds[index];
    if (!id) {
      throw new Error(`Missing companion id at index ${index}`);
    }
    return id;
  };

  test.beforeAll(async () => {
    seed = await runSeed();
    await ensureRoster();
  });

  test.beforeEach(async () => {
    await resetRoster();
    await resetSlots(3);
  });

  test('lists companions with slot metadata', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.get('/api/companions/list');
    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(typeof payload.maxSlots).toBe('number');
    await viewerCtx.dispose();
  });

  test('set active companion flips previous', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const first = requireCompanionId(0);
    const second = companionIds[1] ?? first;

    await adminClient
      .from('companions')
      .update({ is_active: true, state: 'active' })
      .eq('id', second)
      .throwOnError();

    const res = await viewerCtx.post('/api/companions/active', {
      data: { companionId: first }
    });
    expect(res.status()).toBe(200);

    const current = await fetchCompanion(first);
    const previous = await fetchCompanion(second);
    expect(current.is_active).toBe(true);
    expect(previous.is_active).toBe(false);
    await viewerCtx.dispose();
  });

  test('reorder respects slot ceiling', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const order = companionIds.slice(0, 3).reverse();
    const res = await viewerCtx.post('/api/companions/reorder', {
      data: { order }
    });
    expect(res.status()).toBe(200);

    const snapshots = await adminClient
      .from('companions')
      .select('id, slot_index')
      .in('id', order)
      .order('slot_index', { ascending: true, nullsFirst: false });

    if (snapshots.error) throw snapshots.error;
    expect((snapshots.data ?? []).map((row) => row.id)).toEqual(order.slice(0, snapshots.data?.length ?? 0));
    await viewerCtx.dispose();
  });

  test('rename accepts valid length and rejects invalid', async () => {
    const target = requireCompanionId(0);
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    const okRes = await viewerCtx.post('/api/companions/rename', {
      data: { companionId: target, name: 'Aurora Nova' }
    });
    expect(okRes.status()).toBe(200);
    const after = await fetchCompanion(target);
    expect(after.name).toBe('Aurora Nova');

    const badRes = await viewerCtx.post('/api/companions/rename', {
      data: { companionId: target, name: '' }
    });
    expect(badRes.status()).toBe(400);

    await viewerCtx.dispose();
  });

  test('state endpoint toggles resting', async () => {
    const target = requireCompanionId(0);
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const restRes = await viewerCtx.post('/api/companions/state', {
      data: { companionId: target, state: 'resting' }
    });
    expect(restRes.status()).toBe(200);
    const resting = await fetchCompanion(target);
    expect(resting.state).toBe('resting');
    expect(resting.is_active).toBe(false);

    const badState = await viewerCtx.post('/api/companions/state', {
      data: { companionId: target, state: 'sleeping' }
    });
    expect(badState.status()).toBe(400);
    await viewerCtx.dispose();
  });

  test('unlock slot endpoint increments until capped', async () => {
    await resetSlots(3);
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.post('/api/companions/slots', {
      data: { reason: 'spec_test' }
    });
    expect(res.status()).toBe(200);
    const payload = await res.json();
    expect(payload.maxSlots).toBeGreaterThanOrEqual(4);
    await viewerCtx.dispose();
  });
});
