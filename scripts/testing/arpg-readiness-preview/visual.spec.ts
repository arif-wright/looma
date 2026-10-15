import type { Page, TestInfo } from '@playwright/test';
import { test } from './guard';
import { VISUAL_TITLES } from './visual-contract.mjs';
import { runControlledVisual } from './visual-browser';
for (const [index, title] of VISUAL_TITLES.entries()) {
  test(title, async ({ page }: { page: Page }, info: TestInfo) => runControlledVisual(page, info, index));
}
