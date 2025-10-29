import { expect, test } from '@playwright/test';
import { seed, type SeedResult } from '../fixtures/env';
import { loginAs } from '../fixtures/auth';

test.describe('Social reactions & shares', () => {
  test.slow();

  let seedData: SeedResult;

  test.beforeAll(async () => {
    seedData = await seed();
  });

  test('post & comment reactions with share flows persist', async ({ page }) => {
    await loginAs(page, seedData.viewer);

    await test.step('post like persists after reload', async () => {
      await page.goto('/app/home');
      await page.waitForLoadState('networkidle');

      const feedItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      ).first();
      await expect(feedItem, 'feed item visible').toBeVisible();

      const likeButton = feedItem.locator('[data-testid="react-like"]');
      const likeCount = feedItem.locator('[data-testid="count-like"]');

      await likeButton.click();
      await expect(likeCount).toHaveText('1');
      await expect(likeButton).toHaveAttribute('aria-pressed', 'true');

      await page.reload();
      await page.waitForLoadState('networkidle');

      const reloadedItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      );
      await expect(reloadedItem.locator('[data-testid="count-like"]')).toHaveText('1');
      await expect(reloadedItem.locator('[data-testid="react-like"]')).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      await reloadedItem.locator('[data-testid="react-like"]').click();
      await expect(reloadedItem.locator('[data-testid="count-like"]')).toHaveText('0');
      await expect(reloadedItem.locator('[data-testid="react-like"]')).toHaveAttribute(
        'aria-pressed',
        'false'
      );

      await page.reload();
      await page.waitForLoadState('networkidle');
      const finalItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      );
      await expect(finalItem.locator('[data-testid="count-like"]')).toHaveText('0');
    });

    await test.step('comment reaction persists across reloads', async () => {
      await page.goto(`/app/u/${seedData.author.handle}/p/${seedData.postId}`);
      await page.waitForLoadState('networkidle');

      const comment = page.locator(
        `[data-testid="comment-item"][data-comment-id="${seedData.commentId}"]`
      );
      await expect(comment, 'seed comment visible').toBeVisible();

      const cheerButton = comment.locator('[data-testid="react-cheer"]').first();
      const cheerCount = comment.locator('[data-testid="count-cheer"]').first();

      await cheerButton.click();
      await expect(cheerCount).toHaveText('1');
      await expect(cheerButton).toHaveAttribute('aria-pressed', 'true');

      await page.reload();
      await page.waitForLoadState('networkidle');

      const commentReloaded = page.locator(
        `[data-testid="comment-item"][data-comment-id="${seedData.commentId}"]`
      );
      await expect(commentReloaded.locator('[data-testid="count-cheer"]')).toHaveText('1');
      await expect(commentReloaded.locator('[data-testid="react-cheer"]')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    await test.step('repost triggers toast and persists', async () => {
      await page.goto('/app/home');
      await page.waitForLoadState('networkidle');
      const feedItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      ).first();
      await expect(feedItem).toBeVisible();

      const shareCount = feedItem.locator('.share-count');
      const repostButton = feedItem.locator('[data-testid="repost"]');

      await repostButton.click();
      const toast = page.locator('[data-testid="toast-success"]').first();
      await expect(toast).toHaveText(/Reposted/i);
      await expect(shareCount).toHaveText(/1 share/);
      await expect(feedItem.locator('.feed-item__shared-indicator')).toHaveText('Reposted by you');

      await page.reload();
      await page.waitForLoadState('networkidle');
      const reloadedItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      );
      await expect(reloadedItem.locator('.share-count')).toHaveText(/1 share/);
      await expect(reloadedItem.locator('.feed-item__shared-indicator')).toHaveText(
        'Reposted by you'
      );
    });

    await test.step('quote share updates count', async () => {
      await page.goto('/app/home');
      await page.waitForLoadState('networkidle');
      const feedItem = page.locator(
        `[data-testid="feed-item"][data-post-id="${seedData.postId}"]`
      ).first();
      await expect(feedItem).toBeVisible();

      const quoteButton = feedItem.locator('[data-testid="quote-share"]');
      await quoteButton.click();

      const modalInput = page.locator('[data-testid="quote-input"]');
      await expect(modalInput).toBeVisible();
      await modalInput.fill('Sharing this via automated test quote');

      await page.locator('[data-testid="quote-submit"]').click();
      const toast = page.locator('[data-testid="toast-success"]').first();
      await expect(toast).toHaveText(/Shared with quote/i);

      const shareCount = feedItem.locator('.share-count');
      await expect(shareCount).toHaveText(/2 shares/);
    });
  });
});
