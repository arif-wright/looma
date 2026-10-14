// Test-only exact reversal of the readiness departure call-site delta.
import assert from 'node:assert/strict';
const addedImport="import { departCourtyard } from './courtyard-departure';\n";
const addedCall="await departCourtyard(page, async remaining => {\n      await expect(screen(page).locator('.game-status')).toHaveText('Expedition in progress. Return to town to save your result.', { timeout: remaining() });\n      await expect.poll(async () => {\n        remaining();\n        const scene = (await snapshot(page)).scenes.find(scene => scene.pageId === 1 && !scene.destroyed);\n        remaining();\n        return scene?.gameplay?.area === 1 && scene.gameplay.expeditionActive;\n      }, { timeout: remaining() }).toBe(true);\n    });";
export function beforePlazaDeparture(source) {
  assert.equal(source.split(addedImport).length,2,'Exactly one bounded departure import');
  assert.equal(source.split(addedCall).length,2,'Exactly one bounded departure callback');
  return source.replace(addedImport,'').replace(addedCall,"await page.keyboard.press('e');await expedition(page);").replace('gameplay, screen, snapshot','gameplay, expedition, screen, snapshot');
}
