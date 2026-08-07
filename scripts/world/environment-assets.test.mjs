import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { ENVIRONMENT_SOURCES, prepareEnvironmentAssets, validateEnvironmentSources } from './environment-assets.mjs';

test('validates all approved source dimensions, transparency, and frame counts', async () => {
  const report = await validateEnvironmentSources();
  assert.equal(report.length, 34);
  assert.equal(report.filter((asset) => asset.kind === 'sheet').length, 14);
  assert.equal(report.filter((asset) => asset.runtime.includes('broadleaf-v2/idle/')).length, 8);
  assert.ok(report.filter((asset) => asset.runtime.includes('broadleaf-v2/idle/')).every((asset) => asset.uniqueFrames === 25));
  assert.ok(report.filter((asset) => asset.runtime.includes('broadleaf-v2/idle/')).every((asset) => asset.duplicateGroups.length === 0 && asset.meanSequentialPixelDifference > 0));
  assert.ok(report.filter((asset) => asset.kind === 'sheet').every((asset) => asset.frames === 25 && asset.transparent));
  assert.ok(report.filter((asset) => asset.kind === 'static-rgb').every((asset) => !asset.transparent));
});

test('copies source bytes deterministically without changing approved artwork', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'memvoya-environment-'));
  try {
    const first = await prepareEnvironmentAssets(undefined, output);
    const second = await prepareEnvironmentAssets(undefined, output);
    assert.deepEqual(first, second);
    for (const [source, runtime, kind] of ENVIRONMENT_SOURCES) {
      assert.deepEqual(await readFile(path.join(output, runtime)), await readFile(path.join('art-source/world/environment/production/v1', source)));
      if (kind === 'sheet') {
        const sheet = PNG.sync.read(await readFile(path.join(output, runtime)));
        const derived = PNG.sync.read(await readFile(path.join(output, runtime.replace(/\.png$/, '-frame-00.png'))));
        assert.equal(derived.width, 256);
        assert.equal(derived.height, 256);
        for (let y = 0; y < 256; y += 1) {
          assert.deepEqual(derived.data.subarray(y * 1024, y * 1024 + 1024), sheet.data.subarray(y * sheet.width * 4, y * sheet.width * 4 + 1024));
        }
      }
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('rejects a missing production source', async () => {
  await assert.rejects(validateEnvironmentSources('art-source/world/environment/production/missing'));
});
