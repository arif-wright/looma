import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const SOURCE = 'art-source/world/environment/production/v1';
const OUTPUT = 'static/game/environment/v1';
const FRAME_SIZE = 256;

export const ENVIRONMENT_SOURCES = [
  ['terrain/grass_base_01.png', 'terrain/grass-base-01.png', 'static-rgb'],
  ['terrain/grass_base_02.png', 'terrain/grass-base-02.png', 'static-rgb'],
  ['terrain/dirt_path.png', 'terrain/dirt-path.png', 'static-rgb'],
  ['terrain/grass_path_transition.png', 'terrain/grass-path-transition.png', 'static-rgb'],
  ['trees/broadleaf/tree.png', 'props/trees/broadleaf.png', 'static-rgba'],
  ['trees/broadleaf/idle/tree-spritesheet.png', 'props/trees/broadleaf-idle.png', 'sheet'],
  ['v2/trees/broadleaf/tree_north.png', 'props/trees/broadleaf-v2/static/n.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_northeast.png', 'props/trees/broadleaf-v2/static/ne.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_east.png', 'props/trees/broadleaf-v2/static/e.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_southeast.png', 'props/trees/broadleaf-v2/static/se.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_south.png', 'props/trees/broadleaf-v2/static/s.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_southwest.png', 'props/trees/broadleaf-v2/static/sw.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_west.png', 'props/trees/broadleaf-v2/static/w.png', 'static-rgba'],
  ['v2/trees/broadleaf/tree_northwest.png', 'props/trees/broadleaf-v2/static/nw.png', 'static-rgba'],
  ['v2/trees/broadleaf/idle/tree_north-spritesheet.png', 'props/trees/broadleaf-v2/idle/n.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_northeast-spritesheet.png', 'props/trees/broadleaf-v2/idle/ne.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_east-spritesheet.png', 'props/trees/broadleaf-v2/idle/e.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_southeast-spritesheet.png', 'props/trees/broadleaf-v2/idle/se.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_south-spritesheet.png', 'props/trees/broadleaf-v2/idle/s.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_southwest-spritesheet.png', 'props/trees/broadleaf-v2/idle/sw.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_west-spritesheet.png', 'props/trees/broadleaf-v2/idle/w.png', 'sheet'],
  ['v2/trees/broadleaf/idle/tree_northwest-spritesheet.png', 'props/trees/broadleaf-v2/idle/nw.png', 'sheet'],
  ['trees/evergreen/evergreen.png', 'props/trees/evergreen.png', 'static-rgba'],
  ['trees/evergreen/idle/evergreen-spritesheet.png', 'props/trees/evergreen-idle.png', 'sheet'],
  ['rocks/large_rock_01.png', 'props/rocks/large-rock-01.png', 'static-rgba'],
  ['rocks/medium_rock_01.png', 'props/rocks/medium-rock-01.png', 'static-rgba'],
  ['vegetation/grass-tuft/grass_tuft_01.png', 'props/vegetation/grass-tuft-01.png', 'static-rgba'],
  ['vegetation/grass-tuft/idle/grass_tuft_01-spritesheet.png', 'props/vegetation/grass-tuft-01-idle.png', 'sheet'],
  ['vegetation/flower-cluster/flower_cluster_01.png', 'props/vegetation/flower-cluster-01.png', 'static-rgba'],
  ['vegetation/flower-cluster/idle/flower_cluster_01-spritesheet.png', 'props/vegetation/flower-cluster-01-idle.png', 'sheet'],
  ['magical/aether-plant/aether_plant_01.png', 'props/magical/aether-plant-01.png', 'static-rgba'],
  ['magical/aether-plant/idle/aether_plant_01-spritesheet.png', 'props/magical/aether-plant-01-idle.png', 'sheet'],
  ['magical/moonberry/moonberry_01.png', 'props/magical/moonberry-01.png', 'static-rgba'],
  ['magical/moonberry/idle/moonberry_01-spritesheet.png', 'props/magical/moonberry-01-idle.png', 'sheet']
];

const inspectPng = async (file) => {
  const bytes = await readFile(file);
  const png = PNG.sync.read(bytes);
  let transparentPixels = 0;
  let partialAlphaPixels = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] === 0) transparentPixels += 1;
    else if (png.data[index] < 255) partialAlphaPixels += 1;
  }
  return { bytes, png, transparentPixels, partialAlphaPixels, sha256: createHash('sha256').update(bytes).digest('hex') };
};

export const validateEnvironmentSources = async (sourceRoot = SOURCE) => {
  const report = [];
  for (const [source, runtime, kind] of ENVIRONMENT_SOURCES) {
    const absolute = path.join(sourceRoot, source);
    await stat(absolute);
    const inspected = await inspectPng(absolute);
    let uniqueFrames = 1;
    if (kind === 'static-rgb') {
      assert.equal(inspected.png.width, 1254, `${source} width`);
      assert.equal(inspected.png.height, 1254, `${source} height`);
      assert.equal(inspected.transparentPixels + inspected.partialAlphaPixels, 0, `${source} must remain opaque`);
    } else if (kind === 'static-rgba') {
      assert.equal(inspected.png.width, 1024, `${source} width`);
      assert.equal(inspected.png.height, 1024, `${source} height`);
      assert.ok(inspected.transparentPixels > 0, `${source} requires transparency`);
    } else {
      assert.equal(inspected.png.width, 1280, `${source} width`);
      assert.equal(inspected.png.height, 1280, `${source} height`);
      assert.ok(inspected.transparentPixels > 0, `${source} requires transparency`);
      const hashes = [];
      for (let row = 0; row < 5; row += 1) for (let column = 0; column < 5; column += 1) {
        const hash = createHash('sha256');
        let occupied = false;
        for (let y = 0; y < FRAME_SIZE; y += 1) {
          const start = (((row * FRAME_SIZE + y) * inspected.png.width) + column * FRAME_SIZE) * 4;
          const line = inspected.png.data.subarray(start, start + FRAME_SIZE * 4);
          hash.update(line);
          for (let alpha = 3; alpha < line.length; alpha += 4) if (line[alpha] > 0) occupied = true;
        }
        assert.ok(occupied, `${source} frame ${row * 5 + column} is blank`);
        hashes.push(hash.digest('hex'));
      }
      uniqueFrames = new Set(hashes).size;
      assert.equal(uniqueFrames, 25, `${source} contains duplicate frames`);
    }
    report.push({ source, runtime, kind, width: inspected.png.width, height: inspected.png.height,
      transparent: inspected.transparentPixels + inspected.partialAlphaPixels > 0, frames: kind === 'sheet' ? 25 : 1,
      uniqueFrames, sha256: inspected.sha256 });
  }
  return report;
};

export const prepareEnvironmentAssets = async (sourceRoot = SOURCE, outputRoot = OUTPUT) => {
  const report = await validateEnvironmentSources(sourceRoot);
  for (const asset of report) {
    const destination = path.join(outputRoot, asset.runtime);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(sourceRoot, asset.source), destination, { force: true });
    const copied = await readFile(destination);
    assert.equal(createHash('sha256').update(copied).digest('hex'), asset.sha256, `Runtime copy differs: ${asset.runtime}`);
    if (asset.kind === 'sheet') {
      const sheet = PNG.sync.read(copied);
      const frame = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE });
      PNG.bitblt(sheet, frame, 0, 0, FRAME_SIZE, FRAME_SIZE, 0, 0);
      await writeFile(destination.replace(/\.png$/, '-frame-00.png'), PNG.sync.write(frame, { colorType: 6 }));
    }
  }
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'asset-audit.json'), `${JSON.stringify({ version: 1, generatedBy: 'scripts/world/environment-assets.mjs', assets: report }, null, 2)}\n`);
  return report;
};

const command = process.argv[2] ?? 'validate';
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const report = command === 'prepare' ? await prepareEnvironmentAssets() : await validateEnvironmentSources();
  console.log(`${command === 'prepare' ? 'Prepared' : 'Validated'} ${report.length} approved environment files (${report.filter((asset) => asset.kind === 'sheet').length} animation sheets).`);
}
