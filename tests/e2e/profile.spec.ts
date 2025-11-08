import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_USERS } from '../fixtures/env';

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env ${key} for profile e2e tests`);
  }
  return value;
};

const getAdminClient = () => {
  const url = requireEnv('PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

test.describe('Profile overview', () => {
  test('self profile shows identity and featured companion', async ({ page }) => {
    await page.goto('/app/profile');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: new RegExp(TEST_USERS.viewer.displayName, 'i')
      })
    ).toBeVisible();
    await expect(page.getByText(/Featured Companion/i)).toBeVisible();
    await expect(page.getByText(/SHARDS/i)).toBeVisible();
  });

  test('public profile route renders by handle with companion card', async ({ page }) => {
    await page.goto(`/app/u/${TEST_USERS.author.handle}`);
    await expect(page.getByText(`@${TEST_USERS.author.handle}`)).toBeVisible();
    await expect(page.getByText(/Featured Companion/i)).toBeVisible();
  });

  test('private profiles return 404 for non-owners', async ({ page }) => {
    const admin = getAdminClient();
    const targetId = TEST_USERS.author.id;
    if (!targetId) {
      throw new Error('Missing seeded author id');
    }

    const toggle = async (value: boolean) => {
      const { error } = await admin.from('profiles').update({ is_private: value }).eq('id', targetId);
      if (error) {
        throw new Error(`Failed to toggle privacy: ${error.message}`);
      }
    };

    await toggle(true);
    try {
      const response = await page.goto(`/app/u/${TEST_USERS.author.handle}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByText(/Profile not found/i)).toBeVisible();
    } finally {
      await toggle(false);
    }
  });
});
