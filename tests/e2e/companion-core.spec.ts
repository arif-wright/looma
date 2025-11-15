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

const minutesAgoIso = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const resetCompanion = async (companionId: string) => {
  await adminClient
    .from('companions')
    .update({ affection: 40, trust: 35, energy: 80, mood: 'neutral' })
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
        last_passive_tick: null,
        last_daily_bonus_at: null
      },
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

  test('daily check-in bonus surfaces once per day', async ({ page }) => {
    await adminClient
      .from('companions')
      .update({ affection: 40, trust: 38, energy: 55 })
      .eq('id', companionId);
    await adminClient
      .from('companion_stats')
      .update({
        last_daily_bonus_at: minutesAgoIso(60 * 48),
        last_passive_tick: minutesAgoIso(5)
      })
      .eq('companion_id', companionId);

    await page.goto('/app/companions');
    await page.getByRole('article').filter({ hasText: new RegExp(companionName, 'i') }).first().click();
    const modal = page.getByRole('dialog');

    const messageLocator = modal.locator('.event-row__message').filter({ hasText: 'Brightened when you checked in today.' }).first();
    await expect(messageLocator).toBeVisible();
    const affectionMeter = modal.locator('label:has-text("Affection") [role="progressbar"]').first();
    const affectionAfterFirst = Number(await affectionMeter.getAttribute('aria-valuenow'));
    expect(affectionAfterFirst).toBeGreaterThan(40);

    await page.reload();
    await page.getByRole('article').filter({ hasText: new RegExp(companionName, 'i') }).first().click();
    const modalAgain = page.getByRole('dialog');

    await expect(modalAgain.locator('.event-row__message').filter({ hasText: 'Brightened when you checked in today.' })).toHaveCount(1);
    const affectionAfterReload = Number(
      await modalAgain.locator('label:has-text("Affection") [role="progressbar"]').first().getAttribute('aria-valuenow')
    );
    expect(affectionAfterReload).toBe(affectionAfterFirst);
  });

  test('passive tick nudges vitals and logs a rest event', async ({ page }) => {
    await adminClient
      .from('companions')
      .update({ affection: 78, trust: 66, energy: 25 })
      .eq('id', companionId);
    await adminClient
      .from('companion_stats')
      .update({
        last_passive_tick: minutesAgoIso(60 * 24),
        last_daily_bonus_at: minutesAgoIso(15)
      })
      .eq('companion_id', companionId);

    await page.goto('/app/companions');
    await page.getByRole('article').filter({ hasText: new RegExp(companionName, 'i') }).first().click();
    const modal = page.getByRole('dialog');

    await expect(modal.locator('.event-row__action').first()).toHaveText(/Rest/i);
    await expect(modal.locator('.event-row__icon').first()).toHaveText('🌙');

    const affectionMeter = modal.locator('label:has-text("Affection") [role="progressbar"]').first();
    const trustMeter = modal.locator('label:has-text("Trust") [role="progressbar"]').first();
    const energyMeter = modal.locator('label:has-text("Energy") [role="progressbar"]').first();

    const affectionValue = Number(await affectionMeter.getAttribute('aria-valuenow'));
    const trustValue = Number(await trustMeter.getAttribute('aria-valuenow'));
    const energyValue = Number(await energyMeter.getAttribute('aria-valuenow'));

    expect(affectionValue).toBe(74);
    expect(trustValue).toBe(63);
    expect(energyValue).toBe(49);
  });
});
