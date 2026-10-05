import { expect, test, type Page } from '@playwright/test';

// Local presentation verification only. These tests do not establish server authority or persisted rewards.
const fixture = '/scripts/testing/connected-wilds-preview/index.html';
const loaded = async (page: Page) => {
  await page.goto(fixture);
  await expect(page.locator('canvas')).toHaveAttribute('data-local-sprite-load', 'loaded');
};

test('production assets load and players, companions and residents are map-filtered', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.url().includes('/game/') && !response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  await loaded(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-area-id', 'wilds-exploration');
  await expect(canvas).toHaveAttribute('data-visible-player-count', '2');
  await expect(canvas).toHaveAttribute('data-resident-count', '1');
  await expect(canvas).toHaveAttribute('data-follower-count', '1');
  await page.getByRole('button', { name: 'Lantern Hollow', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-area-id', 'wilds-town');
  await expect(canvas).toHaveAttribute('data-prediction-blocker-count', '7');
  await expect(canvas).toHaveAttribute('data-visible-player-count', '2');
  await expect(canvas).toHaveAttribute('data-resident-count', '1');
  expect(errors).toEqual([]);
});

test('resident follows fresh synthetic snapshots and is explicitly labeled Resident', async ({ page }) => {
  await loaded(page);
  const read = () => page.evaluate(() => {
    const scene = (window as any).__WILDS_FIXTURE__.scene;
    const actor = scene.children.list.find((item: any) => item.type === 'Text' && item.text.includes('Resident'));
    return { text: actor?.text, x: actor?.x, y: actor?.y };
  });
  const initial = await read();
  expect(initial.text).toBe('Rowan · Resident');
  await expect.poll(async () => (await read()).x).not.toBe(initial.x);
});

test('portal prompt comes from authoritative snapshots and E invokes travel before gather', async ({ page }) => {
  await loaded(page);
  await page.evaluate(() => {
    const fixture = (window as any).__WILDS_FIXTURE__;
    (window as any).__PROMPT_TEST__ = { portal: null, travel: 0, gather: 0 };
    const state = (window as any).__PROMPT_TEST__;
    fixture.scene.setPortalHandlers(() => state.travel++, (portal: any) => state.portal = portal?.id ?? null);
    fixture.scene.setInteractionHandlers(() => state.gather++, () => {});
    fixture.putLocal(880, 270);
  });
  await expect.poll(() => page.evaluate(() => (window as any).__PROMPT_TEST__.portal)).toBe('grove-to-hollow');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => (window as any).__PROMPT_TEST__.travel)).toBe(1);
  expect(await page.evaluate(() => (window as any).__PROMPT_TEST__.gather)).toBe(0);
  await page.evaluate(() => (window as any).__WILDS_FIXTURE__.putLocal(440, 270));
  await expect.poll(() => page.evaluate(() => (window as any).__PROMPT_TEST__.portal)).toBe(null);
});

test('disconnect suppresses native key repeats until keyup and a fresh keydown', async ({ page }) => {
  await loaded(page);
  const canvas = page.locator('canvas');
  await page.keyboard.down('d');
  await expect.poll(() => canvas.getAttribute('data-facing')).toBe('e');
  await page.evaluate(() => {
    const fixture = (window as any).__WILDS_FIXTURE__;
    fixture.touch.x = 1;
    fixture.scene.setConnectionActive(false);
  });
  await expect(canvas).toHaveAttribute('data-connection-active', 'false');
  const frozenX = await canvas.getAttribute('data-local-player-x');
  await page.evaluate(() => (window as any).__WILDS_FIXTURE__.scene.setConnectionActive(true));
  await page.keyboard.down('d'); // Still physically held: browser emits repeat:true.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await canvas.getAttribute('data-local-player-x')).toBe(frozenX);
  expect(await page.evaluate(() => (window as any).__WILDS_FIXTURE__.touch)).toEqual({ x: 0, y: 0 });
  await page.keyboard.up('d');
  await page.keyboard.down('d');
  await expect.poll(() => canvas.getAttribute('data-local-player-x')).not.toBe(frozenX);
  await page.keyboard.up('d');
});

test('area transition suppresses native key repeats until keyup and a fresh keydown', async ({ page }) => {
  await loaded(page);
  const canvas = page.locator('canvas');
  await page.keyboard.down('d');
  await expect.poll(() => canvas.getAttribute('data-facing')).toBe('e');
  await page.getByRole('button', { name: 'Lantern Hollow', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-area-id', 'wilds-town');
  const arrivedX = await canvas.getAttribute('data-local-player-x');
  await page.keyboard.down('d'); // A repeat after Phaser resetKeys must remain suppressed.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await canvas.getAttribute('data-local-player-x')).toBe(arrivedX);
  await page.keyboard.up('d');
  await page.keyboard.down('d');
  await expect.poll(() => canvas.getAttribute('data-local-player-x')).not.toBe(arrivedX);
  await page.keyboard.up('d');
});

test('reduced motion is honored before load and after preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loaded(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-reduced-motion', 'true');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('canvas')).toHaveAttribute('data-reduced-motion', 'false');
});

for (const width of [320, 390, 844, 1280]) {
  test(`both illustrated areas fit ${width}px with synthetic provenance visible`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 800 });
    await loaded(page);
    await expect(page.getByText('Local presentation fixture · simulated snapshots')).toBeVisible();
    for (const [button, mapId] of [['Moonberry Grove', 'wilds-exploration'], ['Lantern Hollow', 'wilds-town']]) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.locator('canvas')).toHaveAttribute('data-area-id', mapId!);
      const box = await page.locator('canvas').boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`${mapId}-${width}-synthetic.png`), fullPage: true });
    }
  });
}

test('repeated round trips clean up scenery, former-area actors and follower trails', async ({ page }) => {
  await loaded(page);
  const initialCount = await page.evaluate(() => (window as any).__WILDS_FIXTURE__.scene.children.length);
  for (let count = 0; count < 5; count++) {
    await page.getByRole('button', { name: 'Lantern Hollow', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-area-id', 'wilds-town');
    await page.getByRole('button', { name: 'Moonberry Grove', exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-area-id', 'wilds-exploration');
  }
  expect(await page.evaluate(() => (window as any).__WILDS_FIXTURE__.scene.children.length)).toBe(initialCount);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveAttribute('data-resident-count', '1');
  await expect(page.locator('canvas')).toHaveAttribute('data-follower-count', '1');
});
