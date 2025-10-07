import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: 'tests',
  use: {
    baseURL: 'http://127.0.0.1:4173'
  },
  webServer: {
    command: 'npm run preview:e2e',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
};

export default config;
