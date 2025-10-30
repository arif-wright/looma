import type { PlaywrightTestConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const base = new URL(BASE_URL);
const WEB_SERVER_PORT = base.port ? Number(base.port) : 5173;

const config: PlaywrightTestConfig = {
  testDir: 'tests',
  use: {
    baseURL: BASE_URL
  },
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${WEB_SERVER_PORT}`,
    port: WEB_SERVER_PORT,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
};

export default config;
