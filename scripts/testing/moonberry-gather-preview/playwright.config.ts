import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
export default defineConfig({
  testDir: '.', testMatch: '*.browser.spec.ts', forbidOnly: Boolean(process.env.CI),
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  outputDir: `${repository}artifacts/moonberry-gather/browser`,
  use: { baseURL: 'http://127.0.0.1:4178', browserName: 'chromium', serviceWorkers: 'block',
    trace: 'on', screenshot: 'only-on-failure' },
  projects: [...['phaser', 'three'].flatMap((renderer) => [
    { name: `${renderer}-desktop`, metadata: { renderer }, use: { viewport: { width: 1280, height: 900 } } },
    { name: `${renderer}-narrow`, metadata: { renderer }, use: { viewport: { width: 320, height: 844 }, hasTouch: true, isMobile: true } }
  ]), ...[
    { name: 'three-short-portrait', renderer: 'three', width: 320, height: 568 },
    { name: 'three-mobile', renderer: 'three', width: 390, height: 844 },
    { name: 'three-small-landscape', renderer: 'three', width: 568, height: 320 },
    { name: 'three-medium-landscape', renderer: 'three', width: 667, height: 375 },
    { name: 'three-landscape', renderer: 'three', width: 844, height: 390 },
    { name: 'phaser-landscape', renderer: 'phaser', width: 667, height: 375 }
  ].map(({ name, renderer, width, height }) => ({
    name, metadata: { renderer },
    // Keep full transport recovery on the original four projects and Phaser landscape.
    // Extra Three sizes exercise viewport-specific geometry/input/history and lifecycle.
    ...(renderer === 'three' ? { grep: /Three feedback|unmount during/ } : {}),
    use: { viewport: { width, height }, hasTouch: true, isMobile: true }
  }))],
  webServer: { cwd: repository, command: 'npx vite --config scripts/testing/moonberry-gather-preview/vite.config.mjs',
    url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 60_000 },
  reporter: [['list'], ['json', { outputFile: `${repository}artifacts/moonberry-gather/results.json` }]]
});
