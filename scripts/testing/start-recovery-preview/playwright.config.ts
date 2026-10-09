import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { defineConfig } from '@playwright/test';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = fileURLToPath(new URL('.', import.meta.url));
const executablePath = process.env.START_RECOVERY_BROWSER_EXECUTABLE;
const listingOnly = process.argv.includes('--list');
if (executablePath && !isAbsolute(executablePath)) throw new Error('START_RECOVERY_BROWSER_EXECUTABLE must be an absolute path.');
// Default: package-lock Playwright-managed Chromium. Optional path is deliberately
// opt-in, only for an environment already permitted to run that system browser.
// No channel autodetection, fallback launch, browser download or security flags.
export default defineConfig({
  testDir: '.', testMatch: 'start-recovery.browser.spec.ts',
  forbidOnly: true, workers: 1, retries: 0, timeout: 30_000,
  outputDir: `${fixture}.results/browser-artifacts`,
  use: { baseURL: 'http://127.0.0.1:4279', browserName: 'chromium',
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', trace: 'retain-on-failure',
    screenshot: 'only-on-failure', launchOptions: executablePath ? { executablePath } : {} },
  projects: [{ name: 'chromium-start-recovery' }],
  webServer: {
    // Rebuild this exact candidate before serving it. A Vite dev server injects
    // a WebSocket client even with hmr:false; the guard must continue rejecting it.
    command: `"${process.execPath}" node_modules/vite/bin/vite.js build --config scripts/testing/start-recovery-preview/vite.config.mjs && "${process.execPath}" node_modules/vite/bin/vite.js preview --config scripts/testing/start-recovery-preview/vite.config.mjs`,
    cwd: repository, url: 'http://127.0.0.1:4279', reuseExistingServer: false, timeout: 60_000
  },
  reporter: [['list'], ['json', { outputFile: `${fixture}.results/${listingOnly ? 'discovery-results' : 'browser-results'}.json` }]]
});
