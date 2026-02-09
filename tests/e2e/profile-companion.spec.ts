import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/env';

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env ${key} for companion tests`);
  }
  return value;
};

const getAdminClient = () =>
  createClient(requireEnv('PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

test.describe('Profile companion picker', () => {
  test('owner can swap featured companion', async ({ page }) => {
    const admin = getAdminClient();
    const { data: companionRows, error: companionsError } = await admin
      .from('companions')
      .select('id, name')
      .eq('owner_id', TEST_USERS.viewer.id);

    if (companionsError) {
      throw companionsError;
    }

    if (!companionRows || companionRows.length < 2) {
      test.skip();
      return;
    }

    const originalProfile = await admin
      .from('profiles')
      .select('featured_companion_id')
      .eq('id', TEST_USERS.viewer.id)
      .maybeSingle();

    const fallbackCompanion = companionRows[0];
    if (!fallbackCompanion) {
      test.skip();
      return;
    }

    const originalId = originalProfile.data?.featured_companion_id ?? fallbackCompanion.id;
    const next = companionRows.find((row) => row.id !== originalId) ?? fallbackCompanion;
    const nextName = next.name ?? 'Companion';

    await page.goto('/app/profile');
    await page.getByRole('button', { name: /Swap/i }).click();
    await page.getByRole('button', { name: new RegExp(nextName, 'i') }).click();
    await expect(page.getByText(nextName)).toBeVisible();

    await admin
      .from('profiles')
      .update({ featured_companion_id: originalId })
      .eq('id', TEST_USERS.viewer.id);
  });
});
