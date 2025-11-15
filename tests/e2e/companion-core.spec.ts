import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/env';

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env ${key}`);
  return value;
};

const adminClient = createClient(requireEnv('PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const resetCompanion = async (companionId: string) => {
  await adminClient
    .from('companions')
    .update({ affection: 40, trust: 35, energy: 80, mood: 'neutral' })
    .eq('id', companionId);
  await adminClient
    .from('companion_stats')
    .upsert(
      { companion_id: companionId, care_streak: 0, fed_at: null, played_at: null, groomed_at: null },
      { onConflict: 'companion_id' }
    );
  await adminClient.from('companion_care_events').delete().eq('companion_id', companionId);
  await adminClient
    .from('companion_daily_goals')
    .delete()
    .eq('owner_id', TEST_USERS.viewer.id)
    .eq('action_date', new Date().toISOString().slice(0, 10));
};

test.describe('Companion care loop UI', () => {
  let companionId: string;
  let companionName: string;

  test.beforeAll(async () => {
    const { data, error } = await adminClient
      .from('companions')
      .select('id, name')
      .eq('owner_id', TEST_USERS.viewer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      throw new Error(`Unable to load seed companion: ${error?.message ?? 'not found'}`);
    }

    companionId = data.id as string;
    companionName = data.name as string;
  });

  test.beforeEach(async () => {
    await resetCompanion(companionId);
  });

  test('care actions update vitals, events, and goal ribbon', async ({ page }) => {
    await page.goto('/app/companions');
    await page.getByRole('article').filter({ hasText: new RegExp(companionName, 'i') }).first().click();
    const modal = page.getByRole('dialog');

    const affectionMeter = modal.locator('label:has-text("Affection") [role="progressbar"]').first();
    const energyMeter = modal.locator('label:has-text("Energy") [role="progressbar"]').first();
    const beforeAffection = Number(await affectionMeter.getAttribute('aria-valuenow'));
    const beforeEnergy = Number(await energyMeter.getAttribute('aria-valuenow'));

    const feedButton = modal.getByRole('button', { name: /^Feed/i });
    await feedButton.click();
    await expect(feedButton).toBeDisabled();

    await expect(async () => {
      const value = Number(await affectionMeter.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThan(beforeAffection);
    }).toPass();

    await expect(async () => {
      const value = Number(await energyMeter.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThan(beforeEnergy);
    }).toPass();

    await expect(modal.locator('.event-list .event-row__action').first()).toContainText(/feed/i);
    await expect(feedButton.getByText(/Ready in/i)).toBeVisible();

    await modal.getByRole('button', { name: /^Play/i }).click();
    await modal.getByRole('button', { name: /^Groom/i }).click();

    await expect(modal.locator('.event-list .event-row__action')).toHaveCount(3);
  });
});
