import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.', testMatch: 'presentation.spec.ts', fullyParallel: false, workers: 1,
  // Keep generated evidence separate from historical repository test-results.
  outputDir: '../../../test-results/connected-wilds-browser',
  timeout: 60_000,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../../artifacts/connected-wilds/phaser-browser/results.json', import.meta.url)) }]],
  use: { baseURL: 'http://127.0.0.1:4317', viewport: { width: 1280, height: 800 }, screenshot: 'only-on-failure', trace: 'on' },
  webServer: {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    command: 'node scripts/testing/connected-wilds-preview/serve.mjs',
    url: 'http://127.0.0.1:4317/scripts/testing/connected-wilds-preview/index.html',
    reuseExistingServer: !process.env.CI
  }
});
