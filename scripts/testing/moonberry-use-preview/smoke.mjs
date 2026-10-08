import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], blocked = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== 'http://127.0.0.1:4182' || !['GET', 'HEAD'].includes(request.method())) {
    blocked.push(`${request.method()} ${request.url()}`); return route.abort();
  }
  return route.continue();
});
try {
  await page.goto('http://127.0.0.1:4182');
  await page.getByRole('heading', { name: 'Keepsakes', exact: true }).waitFor();
  await page.getByRole('combobox').first().waitFor();
  await page.screenshot({ path: 'artifacts/moonberry-use/browser-smoke-synthetic.png', fullPage: true });
  const result = { title: await page.title(), body: await page.locator('body').innerText(), errorOverlay: await page.locator('vite-error-overlay').count(), errors, blocked };
  await writeFile('artifacts/moonberry-use/browser-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || blocked.length || result.errorOverlay) process.exitCode = 1;
} finally { await browser.close(); }
