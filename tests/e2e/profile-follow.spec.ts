import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed, type SeedResult } from '../fixtures/env';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const parseCountFromLabel = (value: string | null) => {
  if (!value) return 0;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

test.describe('Profile follow flows', () => {
  test.slow();

  let seedData: SeedResult;

  const clearEdges = async () => {
    if (!seedData) return;
    const ids = [seedData.viewer.id, seedData.author.id];
    const followerClear = await admin.from('follows').delete().in('follower_id', ids);
    if (followerClear.error) {
      throw followerClear.error;
    }
    const followeeClear = await admin.from('follows').delete().in('followee_id', ids);
    if (followeeClear.error) {
      throw followeeClear.error;
    }
  };

  test.beforeAll(async () => {
    seedData = await runSeed();
    await clearEdges();
  });

  test.beforeEach(async () => {
    await clearEdges();
  });

  test('viewer can follow another explorer from profile header', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);

    await page.goto(`/app/u/${seedData.author.handle}`);
    await page.waitForLoadState('networkidle');

    const toggle = page.locator('[data-testid="profile-follow-toggle"]');
    const followerButton = page.locator('[data-testid="profile-followers-count"]');

    await expect(toggle).toHaveText(/Follow/i);
    const initialFollowers = parseCountFromLabel(await followerButton.textContent());

    await toggle.click();
    await expect(toggle).toHaveText(/Following/i);

    await expect.poll(async () => parseCountFromLabel(await followerButton.textContent())).toBe(
      initialFollowers + 1
    );

    await page.reload();
    await page.waitForLoadState('networkidle');

    const toggleAfterReload = page.locator('[data-testid="profile-follow-toggle"]');
    await expect(toggleAfterReload).toHaveText(/Following/i);

    await toggleAfterReload.click();
    await expect(toggleAfterReload).toHaveText(/Follow/i);
    await expect.poll(async () => parseCountFromLabel(await followerButton.textContent())).toBe(
      initialFollowers
    );
  });
});
