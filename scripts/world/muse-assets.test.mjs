import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pngjs from 'pngjs';
import { DIRECTIONS, FRAME_SIZE, FRAMES_PER_PAGE, REQUIRED_STATES, SOURCE_SHEETS, ingestMuseSheets, packMuseAtlas, validateMuseFrames } from './muse-assets.mjs';

const { PNG } = pngjs;
const root = mkdtempSync(join(tmpdir(), 'muse-assets-'));
const source = join(root, 'source');
const output = join(root, 'output');

const metadata = {
  version: 2, status: 'approved', sourceApprovalId: 'approved-test-delivery',
  primaryVisualReference: 'updated-approved-muse-hd-gameplay-sheet',
  deprecatedSourcesExcluded: ['static/models/muse.glb'], frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE,
  animations: {
    idle: { fps: 12, loop: true, pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 },
      directions: {
        n: { source: 'authored', frameCount: 24 }, ne: { source: 'authored', frameCount: 5 },
        e: { source: 'authored', frameCount: 5 }, se: { source: 'authored', frameCount: 5 }, s: { source: 'authored', frameCount: 5 },
        sw: { source: 'mirrored', from: 'se' }, w: { source: 'mirrored', from: 'e' }, nw: { source: 'mirrored', from: 'ne' }
      } },
    walk: { fps: 10, loop: true, pivot: { x: .5, y: .96 }, feet: { x: .5, y: .92 }, visualScale: { heightWorldUnits: 2.5 },
      directions: {
        n: { source: 'authored', frameCount: 7 }, ne: { source: 'authored', frameCount: 7 },
        e: { source: 'authored', frameCount: 7 }, se: { source: 'authored', frameCount: 7 }, s: { source: 'authored', frameCount: 7 },
        sw: { source: 'mirrored', from: 'se' }, w: { source: 'mirrored', from: 'e' },
        nw: { source: 'mirrored', from: 'ne' }
      } }
  }
};

const framePath = (state, direction, frame) => join(source, 'frames', state, direction, `muse_${state}_${direction}_${String(frame + 1).padStart(2, '0')}.png`);
const createFrame = (uniqueIndex, width = FRAME_SIZE, height = FRAME_SIZE) => {
  const image = new PNG({ width, height, colorType: 6 });
  image.data.fill(0);
  const pixel = uniqueIndex % (width * height);
  image.data[pixel * 4] = (uniqueIndex * 31) % 255;
  image.data[pixel * 4 + 1] = (uniqueIndex * 67) % 255;
  image.data[pixel * 4 + 2] = (uniqueIndex * 97) % 255;
  image.data[pixel * 4 + 3] = 255;
  return PNG.sync.write(image, { colorType: 6 });
};
const createOpaqueFrame = () => {
  const image = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE, colorType: 6 });
  image.data.fill(255);
  return PNG.sync.write(image, { colorType: 6 });
};

mkdirSync(source, { recursive: true });
writeFileSync(join(source, 'muse.production.json'), JSON.stringify(metadata));
let unique = 1;
for (const state of REQUIRED_STATES) {
  for (const direction of DIRECTIONS) {
    const definition = metadata.animations[state].directions[direction];
    if (definition.source !== 'authored') continue;
    mkdirSync(join(source, 'frames', state, direction), { recursive: true });
    for (let frame = 0; frame < definition.frameCount; frame += 1) writeFileSync(framePath(state, direction, frame), createFrame(unique++));
  }
}
for (const [state, sheets] of Object.entries(SOURCE_SHEETS)) for (const [direction, filename] of Object.entries(sheets)) {
  const sheet = new PNG({ width: FRAME_SIZE * 5, height: FRAME_SIZE * 5, colorType: 6 });
  sheet.data.fill(0);
  const count = metadata.animations[state].directions[direction].frameCount;
  for (let index = 0; index < count; index += 1) {
    const frame = PNG.sync.read(readFileSync(framePath(state, direction, index)));
    const column = index % 5;
    const row = Math.floor(index / 5);
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      const sourceStart = y * FRAME_SIZE * 4;
      const targetStart = ((row * FRAME_SIZE + y) * sheet.width + column * FRAME_SIZE) * 4;
      frame.data.copy(sheet.data, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
    }
  }
  writeFileSync(join(source, filename), PNG.sync.write(sheet, { colorType: 6 }));
}

test('ingests explicit approved sheets without changing frame count or order', () => {
  const result = ingestMuseSheets(source);
  assert.equal(result.writtenFrames, 79);
  assert.equal(validateMuseFrames(source).ok, true);
});

test('accepts a complete approved Muse frame delivery', () => {
  const report = validateMuseFrames(source);
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.expectedFrames, 79);
  assert.equal(report.transparentFrames, 79);
});

test('detects missing and duplicate frames', () => {
  const missing = framePath('idle', 'n', 0);
  const backup = readFileSync(missing);
  unlinkSync(missing);
  assert.match(validateMuseFrames(source).errors.join('\n'), /Missing frame/);
  writeFileSync(missing, backup);

  const duplicate = framePath('walk', 's', 6);
  const duplicateBackup = readFileSync(duplicate);
  cpSync(framePath('idle', 'n', 0), duplicate);
  assert.match(validateMuseFrames(source).errors.join('\n'), /Duplicate frame pixels/);
  writeFileSync(duplicate, duplicateBackup);
});

test('detects invalid dimensions, opacity, and filenames', () => {
  const target = framePath('idle', 'ne', 0);
  const backup = readFileSync(target);
  const opaqueTarget = framePath('idle', 'e', 0);
  const opaqueBackup = readFileSync(opaqueTarget);
  writeFileSync(target, createFrame(999, 128, 256));
  writeFileSync(opaqueTarget, createOpaqueFrame());
  const unexpected = join(source, 'frames', 'idle', 'n', 'concept-sheet.png');
  writeFileSync(unexpected, createFrame(1000));
  const errors = validateMuseFrames(source).errors.join('\n');
  assert.match(errors, /must be 256×256/);
  assert.match(errors, /has no transparent pixels/);
  assert.match(errors, /Unexpected or incorrectly named PNG/);
  writeFileSync(target, backup);
  writeFileSync(opaqueTarget, opaqueBackup);
  unlinkSync(unexpected);
});

test('rejects substitutions outside the explicit Muse direction policy', () => {
  const invalid = structuredClone(metadata);
  invalid.animations.walk.directions.ne = { source: 'temporary-fallback', fallbackDirection: 'e', temporary: true };
  writeFileSync(join(source, 'muse.production.json'), JSON.stringify(invalid));
  assert.match(validateMuseFrames(source).errors.join('\n'), /violates the approved muse direction policy/);
  writeFileSync(join(source, 'muse.production.json'), JSON.stringify(metadata));
});

test('packs every approved frame in order across bounded atlas pages', () => {
  const result = packMuseAtlas(source, output);
  assert.ok(result.atlasPaths.length >= 15);
  for (const path of result.atlasPaths) {
    const atlas = PNG.sync.read(readFileSync(path));
    assert.ok(atlas.width <= FRAMES_PER_PAGE * FRAME_SIZE);
    assert.equal(atlas.height, FRAME_SIZE);
  }
  assert.equal(result.manifest.version, 2);
  assert.equal(result.manifest.status, 'production');
  const north = result.manifest.animations.idle.directions.n.frames;
  assert.equal(north.length, 24);
  assert.equal(north[0].page, 'idle-n-p01');
  assert.deepEqual(north[15], { page: 'idle-n-p01', column: 15, row: 0 });
  assert.deepEqual(north[16], { page: 'idle-n-p02', column: 0, row: 0 });
  assert.equal(result.manifest.animations.idle.directions.ne.frames.length, 5);
  assert.equal(result.manifest.animations.idle.directions.nw.source, 'mirrored-from-ne');
  assert.equal(result.manifest.animations.walk.directions.ne.source, 'authored');
  assert.equal(result.manifest.animations.walk.directions.nw.source, 'mirrored-from-ne');
  assert.equal(result.manifest.animations.walk.directions.sw.source, 'mirrored-from-se');
  assert.deepEqual(result.manifest.directionOrder, DIRECTIONS);

  const sourceEast = PNG.sync.read(readFileSync(framePath('idle', 'e', 0)));
  const westPage = result.manifest.pages.find((page) => page.id === 'idle-w-p01');
  const mirroredWest = PNG.sync.read(readFileSync(join(output, westPage.image)));
  for (let y = 0; y < FRAME_SIZE; y += 1) for (let x = 0; x < FRAME_SIZE; x += 1) {
    const sourcePixel = (y * FRAME_SIZE + x) * 4;
    const mirroredPixel = (y * mirroredWest.width + (FRAME_SIZE - 1 - x)) * 4;
    assert.deepEqual([...mirroredWest.data.subarray(mirroredPixel, mirroredPixel + 4)], [...sourceEast.data.subarray(sourcePixel, sourcePixel + 4)]);
  }
});

test.after(() => rmSync(root, { recursive: true, force: true }));
