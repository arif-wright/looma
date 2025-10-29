import type { PlaywrightTestConfig } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173';

const config: PlaywrightTestConfig = {
  testDir: 'tests',
  use: {
    baseURL: BASE_URL
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 4173',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
};

export default config;
