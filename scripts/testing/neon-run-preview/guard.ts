import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
export const test = base.extend<{ isolatedGuard: void }>({
  isolatedGuard: [async ({ context, page }, use) => {
    const blocked: string[] = [], errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'http://127.0.0.1:4178' || !['GET', 'HEAD'].includes(request.method()) || (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
        blocked.push(`${request.method()} ${request.url()}`); await route.abort(); return;
      }
      await route.continue();
    });
    await use();
    expect(blocked, 'No external requests or mutations').toEqual([]);
    expect(errors, 'No uncaught page errors').toEqual([]);
    if (!page.isClosed()) {
      expect(await page.evaluate(() => window.__neonRunFixture?.blocked ?? []), 'No app API attempts').toEqual([]);
      expect(await page.evaluate(() => window.__neonRunFixture?.calls.filter((call) => call.method === 'fetchPlayerState') ?? []), 'No legacy refresh').toEqual([]);
      expect(await page.evaluate(() => window.__neonRunFixture?.playerStates ?? []), 'No client-side XP/wallet updates').toEqual([]);
    }
  }, { auto: true }]
});
export { expect };
export async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
  const layout = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="neon-run-game"]');
    const note = document.querySelector('.fixture-note');
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : 0,
      ribbonHorizontalOverflow: note ? note.scrollWidth - note.clientWidth : 0,
      ribbonVerticalOverflow: note ? note.scrollHeight - note.clientHeight : 0
    };
  });
  expect(layout.documentOverflow, 'No document horizontal overflow').toBeLessThanOrEqual(0);
  expect(layout.shellOverflow, 'No inner-shell horizontal overflow').toBeLessThanOrEqual(0);
  expect(layout.ribbonHorizontalOverflow, 'Entire fixture ribbon fits horizontally').toBeLessThanOrEqual(0);
  expect(layout.ribbonVerticalOverflow, 'Entire fixture ribbon fits vertically').toBeLessThanOrEqual(0);
}
export const calls = (page: Page, method: string) => page.evaluate((name) => window.__neonRunFixture.calls.filter((call) => call.method === name), method);
export const phase = (page: Page, value: string) => expect(page.getByTestId('neon-run-game')).toHaveAttribute('data-phase', value);
export const start = async (page: Page) => { await page.getByRole('button', { name: 'Start run', exact: true }).click(); await phase(page, 'playing'); };
export const finish = async (page: Page, durationMs = 8000) => {
  await phase(page, 'playing');
  await page.evaluate((duration) => window.__neonRunFixture.finish({ score: 84, durationMs: duration, meta: {
    shards: 4, distance_meters: 82, simulation_elapsed_ms: duration - 10,
    shield_powerups: 1, magnet_powerups: 2, double_powerups: 3,
    slowmo_powerups: 4, dash_powerups: 5, dream_powerups: 6, survived_round: 0
  } }), durationMs);
};
export const openLifecycle = async (page: Page, scenario = 'success') => {
  await page.goto(`/app/games/runner?engine=lifecycle&scenario=${scenario}`);
  await phase(page, 'ready');
};
export const back = async (page: Page) => {
  await page.getByRole('button', { name: /back to play/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
};
