import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const listingOnly = process.argv.includes('--list');
if (process.env.ARPG_READINESS_BROWSER_EXECUTABLE) throw new Error('Use the locked Playwright-managed Chromium only.');
export default defineConfig({
  testDir: '.', testMatch: 'readiness.browser.spec.ts',
  forbidOnly: true, workers: 1, retries: 0, timeout: 70_000,
  expect: { timeout: 15_000 }, outputDir: `${root}.results/browser-artifacts`,
  use: { baseURL: 'http://127.0.0.1:4281', browserName: 'chromium',
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
    // Keep explicit checkpoint PNGs and action/source diagnostics, but avoid
    // continuous duplicate image/DOM capture while measuring native cadence.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
    screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium-arpg-readiness' }],
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js build --config scripts/testing/arpg-readiness-preview/vite.config.mjs && "${process.execPath}" node_modules/vite/bin/vite.js preview --config scripts/testing/arpg-readiness-preview/vite.config.mjs`,
    cwd: repository, url: 'http://127.0.0.1:4281', reuseExistingServer: false, timeout: 60_000
  },
  reporter: [['list'], ['json', { outputFile: `${root}.results/${listingOnly ? 'discovery-results' : 'browser-results'}.json` }]]
});
