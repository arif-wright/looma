import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';
import { runSeed, type SeedResult } from '../fixtures/env';

const admin = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.describe.serial('Alive companion Phase 1', () => {
  let seed: SeedResult;
  let companionId: string;
  let companionName: string;

  test.beforeAll(async () => {
    seed = await runSeed();
    const { data, error } = await admin
      .from('companions')
      .select('id, name')
      .eq('owner_id', seed.viewer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Seed companion unavailable');
    companionId = data.id;
    companionName = data.name;
  });

  test('absence becomes visible, repair completes, and Home remembers it after refresh', async ({ page }) => {
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

    await loginAs(page, VIEWER_CREDENTIALS);
    await page.goto('/app/home');

    await expect(page.getByText(`${companionName} has settled into stillness, but notices that you are here.`)).toBeVisible();
    await page.getByRole('button', { name: `Sit with ${companionName}` }).click();
    await expect(page.getByText(/does not ask anything of you/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stay a little longer' })).toBeVisible();

    await page.getByRole('button', { name: 'Stay a little longer' }).click();
    await expect(page.getByText(/Something between you feels settled again/i)).toBeVisible();
    const repairLink = page.getByRole('link', { name: new RegExp(`See the moment ${companionName} remembered`, 'i') });
    await expect(repairLink).toBeVisible();
    const href = await repairLink.getAttribute('href');

    await page.reload();
    await expect(page.getByRole('button', { name: `Sit with ${companionName}` })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Remembered continuity' }).getByText(/found your way back/i)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Remembered continuity' }).getByRole('link', { name: /Revisit in Journal/i }))
      .toHaveAttribute('href', href ?? '');
  });
});
