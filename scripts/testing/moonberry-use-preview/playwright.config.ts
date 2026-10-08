import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  testDir: '.', testMatch: '*.browser.spec.ts', forbidOnly: Boolean(process.env.CI),
  fullyParallel: false, workers: 1, retries: 0, timeout: 40_000,
  outputDir: `${repository}test-results/moonberry-share/browser`,
  use: { baseURL: 'http://127.0.0.1:4182', browserName: 'chromium', serviceWorkers: 'block',
    trace: 'on', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'narrow', use: { viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true } }
  ],
  webServer: { cwd: repository, command: './node_modules/.bin/vite --config scripts/testing/moonberry-use-preview/vite.config.mjs', url: 'http://127.0.0.1:4182', reuseExistingServer: false, timeout: 60_000 },
  reporter: [['list'], ['json', { outputFile: `${repository}test-results/moonberry-share/browser-results.json` }]]
});
