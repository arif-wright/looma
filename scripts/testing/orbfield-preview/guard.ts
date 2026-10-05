import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
export const test = base.extend<{ isolatedGuard: void }>({
  isolatedGuard: [async ({ context, page }, use) => {
    const blocked: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4177' || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) {
        blocked.push(`${request.method()} ${request.url()}`);
        await route.abort(); return;
      }
      await route.continue();
    });
    await use();
    expect(blocked, 'No external requests or mutations').toEqual([]);
    expect(errors, 'No uncaught page errors').toEqual([]);
    if (!page.isClosed()) {
      expect(await page.evaluate(() => window.__orbfieldFixture?.blocked ?? []), 'No app API attempts').toEqual([]);
      expect(await page.evaluate(() => window.__orbfieldFixture?.calls.filter((call) => call.method === 'fetchPlayerState') ?? []), 'No legacy player-state refresh calls').toEqual([]);
      expect(await page.evaluate(() => window.__orbfieldFixture?.playerStates ?? []), 'No player-state refresh updates').toEqual([]);
    }
  }, { auto: true }]
});
export { expect };
export async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
  expect(await page.evaluate(() => {
    const shell = document.querySelector('.orbfield-shell');
    return document.documentElement.scrollWidth <= innerWidth && (!shell || shell.scrollWidth <= shell.clientWidth);
  }), 'No document or inner-shell horizontal overflow').toBe(true);
}
export const calls = (page: Page, method: string) => page.evaluate((name) => window.__orbfieldFixture.calls.filter((call) => call.method === name), method);
export const finish = async (page: Page, durationMs = 8000) => {
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate((duration) => window.__orbfieldFixture.finish({ score: 84, durationMs: duration, meta: { slowMoUsed: 1 } }), durationMs);
};
export const openLifecycle = async (page: Page, scenario = 'success') => {
  await page.goto(`/app/games/dodge?engine=lifecycle&scenario=${scenario}`);
  await expect(page.getByTestId('orbfield-game')).toHaveAttribute('data-art-state', 'ready');
};
