import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  testDir: '.', testMatch: '*.browser.spec.ts',
  forbidOnly: Boolean(process.env.CI), workers: 1, retries: 0, timeout: 30_000,
  outputDir: `${fixture}.results/screenshots`,
  use: {
    baseURL: 'http://127.0.0.1:4178', browserName: 'chromium',
    serviceWorkers: 'block', trace: 'on', screenshot: 'on', hasTouch: true
  },
  projects: [
    { name: 'narrow-320', use: { viewport: { width: 320, height: 844 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'landscape844', use: { viewport: { width: 844, height: 390 } } }
  ],
  webServer: {
    command: 'npx vite --config scripts/testing/neon-run-preview/vite.config.mjs', cwd: root,
    url: 'http://127.0.0.1:4178', reuseExistingServer: !process.env.CI, timeout: 60_000
  },
  reporter: [['list'], ['json', { outputFile: `${fixture}.results/results.json` }]]
});
