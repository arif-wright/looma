import { expect, test } from '@playwright/test';
import { loginAs, VIEWER_CREDENTIALS } from '../fixtures/auth';

const shortPhone = { width: 320, height: 568 };
const phone = { width: 390, height: 844 };

test.describe('Mobile launch journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(phone);
    await loginAs(page, VIEWER_CREDENTIALS);
  });

  test('onboarding actions remain reachable on a short phone', async ({ page }) => {
    await page.setViewportSize(shortPhone);
    await page.goto('/app/onboarding/companion');

    await expect(page.locator('.fantasy-sidebar')).toHaveCount(0);
    await expect(page.locator('.protected-topbar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Notifications|Messages|Open profile menu/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Open wallet/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Exit Onboarding/i })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Memvoya' })).toBeVisible();

    const next = page.getByTestId('quiz-next');
    await expect(next).toBeVisible();
    await expect(next).toBeInViewport();

    for (let question = 0; question < 12; question += 1) {
      await page.getByTestId('quiz-choice-agree').click();
      await expect(next).toBeInViewport();
      await next.click();
    }

    const finalAction = page.getByTestId('quiz-spawn').or(page.getByRole('link', { name: /Return home/i }));
    await expect(finalAction.first()).toBeVisible();
    await expect(finalAction.first()).toBeInViewport();
  });

  test('first-bond reflection remains actionable when the mobile viewport contracts', async ({ page }) => {
    await page.route('**/api/home/reconnect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reaction: { text: 'I will hold onto the hope in that moment.' },
          memory: {
            id: 'mobile-first-moment',
            title: 'A hopeful first moment',
            body: 'I want this moment to stay with us.',
            createdAt: new Date().toISOString()
          }
        })
      });
    });
    await page.goto('/app/home');

    const reflection = page.getByPlaceholder(/Share a few words with/i);
    if (await reflection.count()) {
      await reflection.focus();
      await page.setViewportSize({ width: phone.width, height: 520 });
      await reflection.fill('I want this moment to stay with us.');

      const submit = page.getByRole('button', { name: /Share your first moment|Check in with|Try saving this moment again/i });
      await expect(reflection).toBeInViewport();
      await expect(submit).toBeVisible();
      await expect(submit).toBeInViewport();
      await submit.click();
      await expect(page.getByRole('link', { name: /See the moment .* remembered/i })).toBeVisible();
    }
  });

  test('remembered return and launch navigation stay clear on mobile', async ({ page }) => {
    await page.goto('/app/home');

    const continuity = page.getByRole('region', { name: 'Remembered continuity' });
    await expect(continuity).toBeVisible();
    await expect(page.getByRole('button', { name: /Open notifications|Open menu/i })).toHaveCount(0);

    const dock = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(dock).toBeVisible();
    const dockOverflows = await dock.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(dockOverflows).toBe(false);

    const journalLink = continuity.getByRole('link', { name: /Revisit in Journal/i });
    if (await journalLink.count()) {
      await expect(continuity.getByText(/persisted in your Journal/i)).toBeVisible();
      await page.reload();
      await expect(page.getByRole('region', { name: 'Remembered continuity' }).getByText(/persisted in your Journal/i)).toBeVisible();
    }
  });

  test('active companion relationship appears before roster breadth on a phone', async ({ page }) => {
    await page.goto('/app/companions');

    const detail = page.getByRole('complementary', { name: 'Active companion details' });
    const roster = page.getByRole('region', { name: 'My companions' });
    await expect(detail).toBeVisible();
    await expect(roster).toBeVisible();

    const detailBox = await detail.boundingBox();
    const rosterBox = await roster.boundingBox();
    expect(detailBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(rosterBox?.y ?? 0);
  });

  test('contextual Sanctuary entry lands on the visible shared-rest action', async ({ page }) => {
    await page.goto('/app/home');

    const restLink = page.getByRole('link', { name: /Rest together/i });
    if (await restLink.count()) {
      await restLink.click();
      await expect(page).toHaveURL(/\/app\/sanctuary#shared-rest$/);
      await expect(page.locator('#shared-rest')).toBeInViewport();
      const restButton = page.getByRole('button', { name: /Rest Together/i });
      await expect(restButton).toBeVisible();
      await expect(restButton).toBeInViewport();
    }
  });

  test('users can log out from Profile on mobile', async ({ page }) => {
    await page.goto('/app/profile');

    const logoutButton = page.getByRole('button', { name: 'Log out' });
    await expect(logoutButton).toBeVisible();
    await logoutButton.scrollIntoViewIfNeeded();
    await expect(logoutButton).toBeInViewport();
    await logoutButton.click();
    await expect(page).toHaveURL(/\/app\/(auth|login)/);
  });
});
