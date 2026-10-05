import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: 'story.browser.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: `${repositoryRoot}keepsake-story-results`,
  use: {
    baseURL: 'http://127.0.0.1:4176',
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'on',
    screenshot: 'on'
  },
  projects: [
    { name: 'narrow-320', use: { viewport: { width: 320, height: 844 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 900 } } }
  ],
  webServer: {
    command: 'npx vite --config scripts/testing/keepsake-story-preview/vite.config.mjs',
    cwd: repositoryRoot,
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  reporter: [
    ['list'],
    ['json', { outputFile: `${repositoryRoot}artifacts/keepsake-story/results.json` }]
  ]
});
