import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/env';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAI0lEQVR42mP8z/C/HwMDAwMjI0P+A4mRgYGBCGA0GACkAgADdAZsLAAAAAElFTkSuQmCC',
  'base64'
);

test.describe('Profile uploads', () => {
  test('avatar uploader updates preview', async ({ page }) => {
    await page.goto('/app/profile');
    const avatarInput = page.getByTestId('avatar-input');
    await avatarInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: tinyPng
    });
    await expect(page.getByTestId('avatar-preview')).toHaveAttribute('src', /avatars/);
  });

  test('banner uploader updates preview', async ({ page }) => {
    await page.goto('/app/profile');
    const bannerInput = page.getByTestId('banner-input');
    await bannerInput.setInputFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: tinyPng
    });
    await expect(page.getByTestId('banner-uploader')).toHaveAttribute('style', /banners\//);
  });

  test('public profile hides upload controls', async ({ page }) => {
    await page.goto(`/app/u/${TEST_USERS.author.handle}`);
    await expect(page.locator('[data-testid=avatar-input]')).toHaveCount(0);
    await expect(page.locator('[data-testid=banner-input]')).toHaveCount(0);
  });
});
