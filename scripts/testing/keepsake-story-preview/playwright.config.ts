import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'story.browser.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4176', viewport: { width: 390, height: 844 } },
  webServer: { command: 'npx vite --config scripts/testing/keepsake-story-preview/vite.config.mjs', cwd: fileURLToPath(new URL('../../../', import.meta.url)), url: 'http://127.0.0.1:4176', reuseExistingServer: true },
  reporter: 'list'
});
