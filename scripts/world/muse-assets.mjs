#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const REQUIRED_STATES = ['idle', 'walk'];
export const FRAME_SIZE = 256;
export const FRAMES_PER_PAGE = 16;
export const DEFAULT_SOURCE = 'art-source/world/companions/muse/production/v1';
export const DEFAULT_OUTPUT = 'artifacts/world/companions/muse/v1';

const expectedFramePath = (root, state, direction, index) =>
  join(root, 'frames', state, direction, `muse_${state}_${direction}_${String(index + 1).padStart(2, '0')}.png`);

const walkFiles = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
};
const normalizedPoint = (value) => value && typeof value === 'object' &&
  Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1;

const readMetadata = (root, errors) => {
  const path = join(root, 'muse.production.json');
  if (!existsSync(path)) { errors.push('Missing muse.production.json metadata.'); return null; }
  try {
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    if (metadata.version !== 2) errors.push('Metadata version must be 2.');
    if (metadata.status !== 'approved') errors.push('Metadata status must be "approved" before packing.');
    if (typeof metadata.sourceApprovalId !== 'string' || !metadata.sourceApprovalId.trim()) errors.push('Metadata requires sourceApprovalId.');
    if (typeof metadata.primaryVisualReference !== 'string' || !metadata.primaryVisualReference.trim()) errors.push('Metadata requires primaryVisualReference.');
    if (metadata.frameWidth !== FRAME_SIZE || metadata.frameHeight !== FRAME_SIZE) errors.push(`Metadata frame size must be ${FRAME_SIZE}×${FRAME_SIZE}.`);
    if (!Array.isArray(metadata.deprecatedSourcesExcluded) || !metadata.deprecatedSourcesExcluded.includes('static/models/muse.glb')) errors.push('Metadata must explicitly exclude static/models/muse.glb.');
    for (const state of REQUIRED_STATES) {
      const animation = metadata.animations?.[state];
      if (!animation) { errors.push(`Missing ${state} animation metadata.`); continue; }
      if (!Number.isFinite(animation.fps) || animation.fps <= 0) errors.push(`${state} requires positive FPS.`);
      if (typeof animation.loop !== 'boolean') errors.push(`${state} requires loop metadata.`);
      if (!normalizedPoint(animation.pivot)) errors.push(`${state} requires normalized pivot metadata.`);
      if (!normalizedPoint(animation.feet)) errors.push(`${state} requires normalized feet/ground metadata.`);
      if (!Number.isFinite(animation.visualScale?.heightWorldUnits) || animation.visualScale.heightWorldUnits <= 0) errors.push(`${state} requires positive visualScale.heightWorldUnits.`);
      for (const direction of DIRECTIONS) {
        const sequence = animation.directions?.[direction];
        if (!sequence || !Number.isInteger(sequence.frameCount) || sequence.frameCount < 1) errors.push(`${state}.${direction} requires a positive integer frameCount.`);
        if (sequence?.fps !== undefined && (!Number.isFinite(sequence.fps) || sequence.fps <= 0)) errors.push(`${state}.${direction} FPS override must be positive.`);
        if (sequence?.loop !== undefined && typeof sequence.loop !== 'boolean') errors.push(`${state}.${direction} loop override must be boolean.`);
      }
    }
    return metadata;
  } catch (error) {
    errors.push(`Invalid muse.production.json: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export const validateMuseFrames = (sourceDirectory = DEFAULT_SOURCE) => {
  const root = resolve(sourceDirectory);
  const errors = [];
  const warnings = [];
  const metadata = readMetadata(root, errors);
  const expected = [];
  if (metadata) for (const state of REQUIRED_STATES) for (const direction of DIRECTIONS) {
    const count = metadata.animations?.[state]?.directions?.[direction]?.frameCount;
    if (Number.isInteger(count) && count > 0) for (let index = 0; index < count; index += 1) expected.push(expectedFramePath(root, state, direction, index));
  }
  const expectedSet = new Set(expected.map((path) => resolve(path)));
  const suppliedPngs = walkFiles(join(root, 'frames')).filter((path) => path.toLowerCase().endsWith('.png')).map((path) => resolve(path));
  for (const path of expected) if (!existsSync(path)) errors.push(`Missing frame: ${relative(root, path)}`);
  for (const path of suppliedPngs) if (!expectedSet.has(path)) errors.push(`Unexpected or incorrectly named PNG: ${relative(root, path)}`);
  const hashes = new Map();
  let transparentFrames = 0;
  for (const path of expected.filter(existsSync)) {
    try {
      const image = PNG.sync.read(readFileSync(path), { skipRescale: true });
      if (image.width !== FRAME_SIZE || image.height !== FRAME_SIZE) errors.push(`${relative(root, path)} must be ${FRAME_SIZE}×${FRAME_SIZE}; received ${image.width}×${image.height}.`);
      let hasTransparency = false;
      let hasVisiblePixels = false;
      for (let index = 3; index < image.data.length; index += 4) {
        const alpha = image.data[index];
        if (alpha < 255) hasTransparency = true;
        if (alpha > 0) hasVisiblePixels = true;
        if (hasTransparency && hasVisiblePixels) break;
      }
      if (!hasTransparency) errors.push(`${relative(root, path)} has no transparent pixels.`); else transparentFrames += 1;
      if (!hasVisiblePixels) errors.push(`${relative(root, path)} is fully transparent.`);
      const hash = createHash('sha256').update(image.data).digest('hex');
      const duplicate = hashes.get(hash);
      if (duplicate) errors.push(`Duplicate frame pixels: ${relative(root, duplicate)} and ${relative(root, path)}.`); else hashes.set(hash, path);
    } catch (error) { errors.push(`Unreadable PNG ${relative(root, path)}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (suppliedPngs.length === 0) warnings.push('No production frames have been supplied yet.');
  return { ok: errors.length === 0, sourceDirectory: root, expectedFrames: expected.length, suppliedFrames: suppliedPngs.length, transparentFrames, metadata, errors, warnings };
};

const copyFrame = (target, source, column) => {
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const sourceStart = y * FRAME_SIZE * 4;
    const targetStart = (y * target.width + column * FRAME_SIZE) * 4;
    source.data.copy(target.data, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
  }
};

export const packMuseAtlas = (sourceDirectory = DEFAULT_SOURCE, outputDirectory = DEFAULT_OUTPUT) => {
  const report = validateMuseFrames(sourceDirectory);
  if (!report.ok || !report.metadata) {
    const error = new Error(`Muse frame validation failed:\n${report.errors.map((item) => `- ${item}`).join('\n')}`);
    error.report = report;
    throw error;
  }
  const root = report.sourceDirectory;
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const pages = [];
  const atlasPaths = [];
  const directions = {};
  for (const state of REQUIRED_STATES) {
    directions[state] = {};
    for (const direction of DIRECTIONS) {
      const sequence = report.metadata.animations[state].directions[direction];
      const frames = [];
      for (let pageIndex = 0, offset = 0; offset < sequence.frameCount; pageIndex += 1, offset += FRAMES_PER_PAGE) {
        const count = Math.min(FRAMES_PER_PAGE, sequence.frameCount - offset);
        const pageId = `${state}-${direction}-p${String(pageIndex + 1).padStart(2, '0')}`;
        const imageName = `muse.${state}.${direction}.p${String(pageIndex + 1).padStart(2, '0')}.png`;
        const atlas = new PNG({ width: count * FRAME_SIZE, height: FRAME_SIZE, colorType: 6 });
        atlas.data.fill(0);
        for (let local = 0; local < count; local += 1) {
          const frameIndex = offset + local;
          copyFrame(atlas, PNG.sync.read(readFileSync(expectedFramePath(root, state, direction, frameIndex)), { skipRescale: true }), local);
          frames.push({ page: pageId, column: local, row: 0 });
        }
        const atlasPath = join(output, imageName);
        writeFileSync(atlasPath, PNG.sync.write(atlas, { colorType: 6 }));
        atlasPaths.push(atlasPath);
        pages.push({ id: pageId, image: imageName, imageWidth: atlas.width, imageHeight: atlas.height });
      }
      directions[state][direction] = { frames, ...(sequence.fps !== undefined ? { fps: sequence.fps } : {}), ...(sequence.loop !== undefined ? { loop: sequence.loop } : {}) };
    }
  }
  const animationManifest = (state) => {
    const source = report.metadata.animations[state];
    return { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, fps: source.fps, loop: source.loop, directions: directions[state],
      pivot: source.pivot, feet: source.feet, visualScale: source.visualScale,
      ...(source.shadow ? { shadow: source.shadow } : {}), ...(source.effectAnchors ? { effectAnchors: source.effectAnchors } : {}),
      ...(source.labelAnchor ? { labelAnchor: source.labelAnchor } : {}), ...(source.ownerSpacing ? { ownerSpacing: source.ownerSpacing } : {}) };
  };
  const manifest = { version: 2, id: 'muse-hd-production-v2', status: 'production', pages, nativeDirections: true,
    directionOrder: DIRECTIONS, animations: { idle: animationManifest('idle'), walk: animationManifest('walk') } };
  const manifestPath = join(output, 'muse.atlas.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { report, atlasPaths, manifestPath, manifest };
};

const readOption = (args, name, fallback) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const runCli = () => {
  const [, , command, ...args] = process.argv;
  const source = readOption(args, '--source', DEFAULT_SOURCE);
  if (command === 'validate') { const report = validateMuseFrames(source); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ok ? 0 : 1; return; }
  if (command === 'pack') { const result = packMuseAtlas(source, readOption(args, '--output', DEFAULT_OUTPUT)); console.log(JSON.stringify({ ok: true, atlasPaths: result.atlasPaths, manifestPath: result.manifestPath }, null, 2)); return; }
  console.error('Usage: node scripts/world/muse-assets.mjs <validate|pack> [--source DIR] [--output DIR]');
  process.exitCode = 2;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
