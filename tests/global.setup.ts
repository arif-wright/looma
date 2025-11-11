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

  await loginAs(page, { email: seedResult.viewer.email, password: seedResult.viewer.password });
  await page.goto(`${BASE_URL}/app/auth`, { waitUntil: 'networkidle' });
  await page.reload();
  await page.waitForTimeout(1000);

  await page.context().storageState({ path: '.auth/viewer.json' });
  await browser.close();
}
