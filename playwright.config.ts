import type { PlaywrightTestConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const base = new URL(BASE_URL);
const WEB_SERVER_PORT = base.port ? Number(base.port) : 5173;

// CI may not have Supabase secrets wired yet. In that case we still want basic
// smoke tests (marketing + unauth routing) to run instead of failing in globalSetup.
const hasSupabaseSeedEnv = Boolean(process.env.PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const config: PlaywrightTestConfig = {
  testDir: 'tests',
  globalSetup: hasSupabaseSeedEnv ? './tests/global.setup.ts' : undefined,
  testMatch: hasSupabaseSeedEnv
    ? undefined
    : ['homepage.spec.ts', 'homepage.world.spec.ts', 'routing.spec.ts', 'permalink.spec.ts'],
  testIgnore: hasSupabaseSeedEnv
    ? undefined
    : [
      '**/api/**',
      '**/e2e/**',
      '**/ui/**',
      '**/analytics.spec.ts',
      '**/econ.spec.ts',
      '**/games.spec.ts',
      '**/games-*.spec.ts',
      '**/shop.spec.ts'
    ],
  use: {
    baseURL: BASE_URL,
    storageState: hasSupabaseSeedEnv ? '.auth/viewer.json' : undefined
  },
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${WEB_SERVER_PORT}`,
    port: WEB_SERVER_PORT,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
};

export default config;
