import { test, expect, type Page } from '@playwright/test';
import { loginAs, VIEWER_CREDENTIALS } from './fixtures/auth';

const recordSessionRequests = async (page: Page) => {
  const requests: string[] = [];
  await page.route('**/api/games/session/**', async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'An archive must not create or complete a session.' })
    });
  });
  return requests;
};

const mockLeaderboard = async (page: Page) => {
  await page.route('**/api/leaderboard/tiles-run/**', async (route) => {
    const url = new URL(route.request().url());
    const scope = url.pathname.split('/').at(-1);
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '25');
    const total = scope === 'alltime' ? 26 : 1;
    const offset = (pageNumber - 1) * limit;
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) => ({
      rank: offset + index + 1,
      user: {
        id: `${scope}-${offset + index}`,
        handle: `${scope}-player-${offset + index + 1}`,
        displayName: null,
        avatar: null
      },
      score: scope === 'daily' ? 7100 : scope === 'weekly' ? 8800 : 10000 - offset - index,
      when: '2026-01-01T12:00:00.000Z',
      isSelf: offset + index === 0
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows, meta: { page: pageNumber, limit, total } })
    });
  });
};

test.describe('Tiles Run archive', () => {
  test('old game URL stays an archive without starting a session', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    const sessionRequests = await recordSessionRequests(page);
    await mockLeaderboard(page);

    await page.goto('/app/games/tiles-run');
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    await expect(page.getByText('Tiles Run is archived', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/games\/tiles-run$/);
    await expect(page.getByRole('link', { name: 'Play Neon Run', exact: true })).toHaveAttribute(
      'href', '/app/games/runner'
    );
    await expect(page.locator('a[href="/app/games#reward-history"]')).toBeVisible();
    await expect(page.locator('iframe, canvas, #game-container')).toHaveCount(0);
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(25);
    expect(sessionRequests).toEqual([]);

    await page.reload();
    await expect(page.getByTestId('tiles-archive')).toBeVisible();
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(25);
    await expect(page.locator('iframe, canvas, #game-container')).toHaveCount(0);
    expect(sessionRequests).toEqual([]);
  });

  test('historical leaderboards retain scopes, self highlighting, and pagination', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    const sessionRequests = await recordSessionRequests(page);
    await mockLeaderboard(page);
    await page.goto('/app/games/tiles-run');

    const rows = page.getByTestId('leaderboard-row');
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText('10,000');
    await expect(rows.first()).toHaveAttribute('data-self', 'true');
    await page.getByTestId('leaderboard-next').click();
    await expect(rows).toHaveCount(26);
    await expect(rows.last()).toContainText('alltime-player-26');
    await expect(page.getByTestId('leaderboard-next')).toHaveCount(0);

    for (const [label, scope, score] of [
      ['Daily', 'daily', '7,100'],
      ['Weekly', 'weekly', '8,800']
    ] as const) {
      const tab = page.getByRole('tab', { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('leaderboard-list')).toHaveAttribute('data-scope', scope);
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(score);
    }

    await page.getByRole('tab', { name: 'All-time', exact: true }).click();
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText('10,000');
    await expect(page.getByTestId('leaderboard-next')).toBeVisible();
    expect(sessionRequests).toEqual([]);
  });

  test('reward-history link preserves Tiles rewards without featuring the archived game', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    const sessionRequests = await recordSessionRequests(page);
    await mockLeaderboard(page);
    await page.goto('/app/games/tiles-run');
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(25);

    await page.route('**/api/games/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [
          { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 50000 },
          { slug: 'runner', name: 'Neon Run', min_version: '1.0.0', max_score: 50000 }
        ] })
      });
    });
    await page.route('**/api/games/player/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          level: 5, xp: 1200, xpNext: 1600, energy: 8, energyMax: 10, currency: 240,
          rewards: [{
            id: 'historical-tiles-reward', xpDelta: 12, currencyDelta: 24,
            insertedAt: '2026-01-01T12:00:00.000Z', game: 'tiles-run', gameName: 'Tiles Run'
          }]
        })
      });
    });

    await page.locator('a[href="/app/games#reward-history"]').click();
    await expect(page).toHaveURL(/\/app\/games#reward-history$/);
    await expect(page.locator('#reward-history')).toBeVisible();
    const rewardLog = page.getByTestId('reward-log');
    await expect(rewardLog).toContainText('Tiles Run');
    await expect(rewardLog).toContainText('+12 XP');
    await expect(rewardLog).toContainText('+24 shards');
    await expect(page.getByTestId('featured-play')).toHaveAttribute('href', '/app/games/runner');
    await expect(page.getByTestId('games-grid').locator('a[href="/app/games/tiles-run"]')).toHaveCount(0);
    expect(sessionRequests).toEqual([]);
  });

  test('legacy embed shows a notice without redirecting or loading the game', async ({ page }) => {
    const sessionRequests = await recordSessionRequests(page);
    const response = await page.goto('/games/tiles-run/embed?session=legacy-link');

    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    await expect(page.getByText('Tiles Run is archived', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/games\/tiles-run\/embed\?session=legacy-link$/);
    await expect(page.locator('iframe, canvas, #game-container')).toHaveCount(0);
    const archiveLink = page.locator('a[href="/app/games/tiles-run"]');
    await expect(archiveLink).toBeVisible();
    expect(sessionRequests).toEqual([]);
  });
});
