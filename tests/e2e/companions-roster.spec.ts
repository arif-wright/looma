import { test, expect } from '@playwright/test';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('companion view follows canonical active instance and discover is non-activatable', async ({ page }) => {
  await page.goto('/app/companions');
  await expect(page.getByRole('heading', { name: /Your Companions/i })).toBeVisible();
  await expect(page.getByText(/^Companion View$/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Switcher/i })).toBeVisible();
  await expect(page.locator('[data-hydrated=\"true\"]')).toHaveCount(1);

  const switcherItems = page.locator('[data-switcher-item="true"]');
  const switcherCount = await switcherItems.count();
  expect(switcherCount).toBeGreaterThan(0);

  if (switcherCount > 1) {
    const target = switcherItems.nth(1);
    const label = (await target.locator('.switcher-item__name').innerText()).trim();
    const expectedName = label.split('·')[0]?.trim() ?? label;
    await target.click();
    await expect(
      page.getByRole('button', { name: new RegExp(`Check in with\\s+${escapeRegExp(expectedName)}`, 'i') }).first()
    ).toBeVisible({ timeout: 15_000 });
  }

  const primaryCheckIn = page.getByRole('button', { name: /Check in with/i }).first();
  await expect(primaryCheckIn).toBeVisible();
  await primaryCheckIn.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: /Feed/i }).click();
  await modal.getByRole('button', { name: /Close/i }).click();
  await expect(page.getByText(/Last check-in:/i).first()).toBeVisible();

  await page.getByRole('tab', { name: /Discover/i }).click();
  const discoverRow = page.locator('[data-discover-row="true"]').first();
  await expect(discoverRow).toBeVisible();
  await discoverRow.click();
  await expect(page.getByRole('dialog', { name: /archetype/i })).toBeVisible();
  await expect(page.getByText(/Unlock hint:/i)).toBeVisible();
});
