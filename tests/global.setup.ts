import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { BASE_URL, runSeed, TEST_USERS } from './fixtures/env';
import { loginAs } from './fixtures/auth';

export default async function globalSetup(_config: FullConfig) {
  const seedResult = await runSeed();
  TEST_USERS.author = seedResult.author;
  TEST_USERS.viewer = seedResult.viewer;

  await mkdir('.auth', { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/app/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('form[data-testid="login-form"], input[name="email"]');
  await page.waitForTimeout(100);
  await page.fill('input[name="email"]', seedResult.viewer.email);
  await page.fill('input[name="password"]', seedResult.viewer.password);
  await loginAs(page, { email: seedResult.viewer.email, password: seedResult.viewer.password });
  await page.getByTestId('email-login').click();
  await page.waitForTimeout(1000);

  await page.context().storageState({ path: '.auth/viewer.json' });
  await browser.close();
}
