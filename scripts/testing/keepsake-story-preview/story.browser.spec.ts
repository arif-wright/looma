import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

// Fail closed: this component fixture must never talk to a live service or write data.
const test = base.extend<{ readOnlyGuard: void }>({
  readOnlyGuard: [async ({ context, page }, use) => {
    const blocked: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== 'http://127.0.0.1:4176' ||
          !['GET', 'HEAD'].includes(request.method())) {
        blocked.push(`${request.method()} ${request.url()}`);
        await route.abort();
        return;
      }
      await route.continue();
    });
    await use();
    expect(blocked, 'No external requests or mutations').toEqual([]);
    expect(pageErrors, 'No uncaught browser errors').toEqual([]);
  }, { auto: true }]
});

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png'
  });
}
const owned = '10000000-0000-0000-0000-000000000002';
const other = '10000000-0000-0000-0000-000000000005';
const story = `/app/inventory?item=${owned}#keepsake-story`;
test('narrow story, qualification disclosure, exact Journal destination and reload', async ({ page }, testInfo) => {
  await page.goto(story);
  await expect(page.locator('#keepsake-story').getByRole('heading', { name: 'Moss Seat', exact: true })).toBeVisible();
  await expect(page.getByText('Earned through three care moments')).toBeVisible();
  await expect(page.locator('#keepsake-story')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Close story and return to collection' })).toBeFocused();
  await page.keyboard.press('Tab');
  const disclosure = page.locator('#keepsake-story summary');
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#keepsake-story .care-evidence')).toHaveAttribute('open', '');
  await expect(page.locator('#keepsake-story .care-evidence li')).toHaveText([
    /Fed together/, /Played together/, /Groomed together/
  ]);
  await capture(page, testInfo, 'qualified-story-expanded');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Open Journal: A quiet rest with Fern' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4176/app/memory?companion=10000000-0000-0000-0000-000000000007&moment=10000000-0000-0000-0000-000000000030#moment-10000000-0000-0000-0000-000000000030');
  await page.goBack(); await page.reload();
  await expect(page.locator('#keepsake-story').getByRole('heading', { name: 'Moss Seat', exact: true })).toBeVisible();
  await capture(page, testInfo, 'story-after-back-and-reload');
});
test('close, repeated activation, item switching and browser history do not retain stale story data', async ({ page }, testInfo) => {
  await page.goto(story);
  await page.getByRole('link', { name: 'Close story and return to collection' }).click();
  await expect(page.locator('#keepsake-story')).toHaveCount(0);
  const first = page.locator(`#keepsake-${owned}`).getByRole('link', { name: 'Read its story: Moss Seat' });
  await first.click();
  await expect(page.locator('#keepsake-story')).toBeFocused();
  await first.click();
  await expect(page.locator('#keepsake-story')).toHaveCount(1);
  await page.locator(`#keepsake-${other}`).getByRole('link', { name: 'Read its story: Moss Seat' }).click();
  await expect(page.locator('#keepsake-story')).toContainText('Added as a chapter keepsake');
  await expect(page.locator('#keepsake-story')).not.toContainText('A quiet rest with Fern');
  await page.goBack();
  await expect(page.locator('#keepsake-story')).toContainText('Earned through three care moments');
  await page.goForward();
  await expect(page.locator('#keepsake-story')).toContainText('Added as a chapter keepsake');
  await capture(page, testInfo, 'distinct-acquisition-after-forward');
});
test('unavailable and removed-placement states keep the owned collection and historical slot', async ({ page }, testInfo) => {
  await page.goto('/app/inventory?item=foreign#keepsake-story');
  await expect(page.getByRole('heading', { name: 'This story isn’t available' })).toBeVisible();
  await expect(page.locator(`#keepsake-${owned}`)).toBeVisible();
  await capture(page, testInfo, 'unavailable-story-owned-collection');
  await page.goto(`${story.replace('#keepsake-story', '')}&removed=1#keepsake-story`);
  await expect(page.locator('#keepsake-story')).toContainText('In your collection');
  await expect(page.locator('#keepsake-story')).toContainText('Recorded in center glade');
  await capture(page, testInfo, 'removed-placement-historical-slot');
});
