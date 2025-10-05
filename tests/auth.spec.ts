import { test } from '@playwright/test';

test.describe('Magic link authentication', () => {
  test.skip('preserves ?next=/app/creatures after login', async ({ page }) => {
    // TODO: Implement magic-link issuance and verification flow once test harness supports Supabase hooks.
  });

  test.skip('expired token shows message and Retry', async ({ page }) => {
    // TODO: Simulate an expired Supabase hash and assert AuthProgress error state.
  });

  test.skip('offline simulation displays network_error', async ({ page }) => {
    // TODO: Mock network failure during /auth/refresh to surface network_error messaging.
  });
});
