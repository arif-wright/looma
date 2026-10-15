import type { Page, TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { test, expect, open, town, screen } from './guard';
import { VISUAL_MODE, VISUAL_POSES, VISUAL_LIMITS, visualScreenshot, visualViewport } from './visual-contract.mjs';
import type { VisualController } from './visual-observer';
import type { courtyardCapture } from './courtyard-capture';

// This driver uses no movement keys, pointer gameplay, departure or return.
// Its six explicit ECS assignments can only support idle-pose visual review.
export async function runControlledVisual(page: Page, info: TestInfo, index: number) {
  test.setTimeout(VISUAL_LIMITS.caseMs);
  await page.setViewportSize(visualViewport(index));
  await page.addInitScript(() => {
    window.__arpgPlazaFlow = true;
    window.__arpgCourtyardFlow = false;
    window.__arpgReturnFlow = false;
    window.__arpgCourtyardVisualFlow = true;
  });
  const startedAt = Date.now();
  const driver = {
    kind: 'controlled-courtyard-visual-driver', evidenceMode: VISUAL_MODE, nativeMovementEvidence: false,
    index, completed: false, poseIds: [] as string[], elapsedMs: 0,
    visual: null as ReturnType<VisualController['snapshot']> | null,
    captureState: null as ReturnType<typeof courtyardCapture.snapshot> | null,
    captures: [] as Array<{ metadata: ReturnType<typeof courtyardCapture.take>['metadata']; pngSHA256: string }>
  };
  try {
    await open(page); await town(page);
    await screen(page).locator('canvas').scrollIntoViewIfNeeded();
    for (const pose of VISUAL_POSES) {
      const assigned = await page.evaluate((id: string) => window.__arpgCourtyardVisual!.assign(id), pose.id);
      expect(assigned.evidenceMode).toBe(VISUAL_MODE);
      expect(assigned.nativeMovementEvidence).toBe(false);
      await expect.poll(async () => page.evaluate((sequence: number) => {
        const state = window.__arpgCourtyardVisual!.snapshot();
        if (state.errors.length) throw Error(state.errors.join('; '));
        return state.receipts.at(-1)?.sequence === sequence && !state.pending && state.receipts.at(-1)?.settled !== null;
      }, assigned.sequence), { timeout: 15000 }).toBe(true);
      const label = visualScreenshot(index, pose.id);
      const request = await page.evaluate((label: string) => window.__arpgCourtyardCapture.request(label), label);
      await expect.poll(async () => page.evaluate((id: number) => {
        const visual = window.__arpgCourtyardVisual!.snapshot();
        if (visual.errors.length) throw Error(visual.errors.join('; '));
        return window.__arpgFixture.scenes.find(scene => !scene.destroyed)?.gameplay?.plazaProbe?.id === id;
      }, request.id), { timeout: 15000 }).toBe(true);
      const captured = await page.evaluate((id: number) => window.__arpgCourtyardCapture.take(id), request.id);
      const png = Buffer.from(captured.base64, 'base64');
      expect(captured.metadata.label).toBe(label);
      expect(captured.metadata.gameplay.plazaProbe?.id).toBe(request.id);
      driver.captures.push({ metadata: captured.metadata, pngSHA256: createHash('sha256').update(png).digest('hex') });
      await info.attach(label, { body: png, contentType: 'image/png' });
      driver.poseIds.push(pose.id);
    }
    const visual = await page.evaluate(() => window.__arpgCourtyardVisual!.snapshot());
    const captureState = await page.evaluate(() => window.__arpgCourtyardCapture.snapshot());
    driver.visual = visual; driver.captureState = captureState;
    expect(visual.complete).toBe(true);
    expect(visual.errors).toEqual([]);
    expect(captureState.captureCount).toBe(6);
    expect(captureState.pending).toBe(false);
    expect(captureState.requested).toBe(false);
    driver.completed = true;
  } finally {
    driver.elapsedMs = Date.now() - startedAt;
    await info.attach('courtyard-controlled-visual-driver', { body: JSON.stringify(driver), contentType: 'application/json' });
  }
}
