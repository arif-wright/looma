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
export const SOURCE_SHEETS = {
  idle: { n: 'Muse-iso_idle_up-v1.png', ne: 'Muse-iso_idle_northeast-v1.png', e: 'Muse-iso_idle_right-v1.png', se: 'Muse-iso_idle_southeast-v1.png', s: 'Muse-iso_idle_down-v1.png' },
  walk: { n: 'Muse-iso_walk_up-v1.png', ne: 'Muse-iso_walk_northeast-v1.png', e: 'Muse-iso_walk_right-v1.png', se: 'Muse-iso_walk_southeast-v1.png', s: 'Muse-iso_walk_down-v1.png' }
};
export const MUSE_DIRECTION_POLICY = {
  idle: { n: 'authored', ne: 'authored', e: 'authored', se: 'authored', s: 'authored', sw: 'mirrored:se', w: 'mirrored:e', nw: 'mirrored:ne' },
  walk: { n: 'authored', ne: 'authored', e: 'authored', se: 'authored', s: 'authored', sw: 'mirrored:se', w: 'mirrored:e', nw: 'mirrored:ne' }
};

export const ECHO_SOURCE_SHEETS = {
  idle: { n: 'Echo-iso_idle_up-trimmed.png', ne: 'Echo-iso_idle_northeast-v2.png', e: 'Echo-iso_idle_right-v1.png', se: 'Echo-iso_idle_southeast-v1.png', s: 'Echo-iso_idle_down-v1.png' },
  walk: { n: 'Echo-iso_walk_up-trimmed.png', e: 'Echo-iso_walk_right-v1.png', se: 'Echo-iso_walk_southeast-v1.png', s: 'Echo-iso_walk_down-v1.png' }
};
export const ECHO_DIRECTION_POLICY = {
  idle: MUSE_DIRECTION_POLICY.idle,
  walk: { n: 'authored', ne: 'temporary-fallback:e', e: 'authored', se: 'authored', s: 'authored', sw: 'mirrored:se', w: 'mirrored:e', nw: 'temporary-fallback:w' }
};

const assetKeyFor = (root) => root.split(/[\\/]/).includes('echo') ? 'echo' : 'muse';
const assetConfig = (root) => {
  const key = assetKeyFor(root);
  return { key, sheets: key === 'echo' ? ECHO_SOURCE_SHEETS : SOURCE_SHEETS,
    policy: key === 'echo' ? ECHO_DIRECTION_POLICY : MUSE_DIRECTION_POLICY };
};

const expectedFramePath = (root, state, direction, index) =>
  join(root, 'frames', state, direction, `${assetKeyFor(root)}_${state}_${direction}_${String(index + 1).padStart(2, '0')}.png`);

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
  const config = assetConfig(root);
  const path = join(root, `${config.key}.production.json`);
  if (!existsSync(path)) { errors.push(`Missing ${config.key}.production.json metadata.`); return null; }
  try {
    const metadata = JSON.parse(readFileSync(path, 'utf8'));
    if (metadata.version !== 2) errors.push('Metadata version must be 2.');
    if (metadata.status !== 'approved') errors.push('Metadata status must be "approved" before packing.');
    if (typeof metadata.sourceApprovalId !== 'string' || !metadata.sourceApprovalId.trim()) errors.push('Metadata requires sourceApprovalId.');
    if (typeof metadata.primaryVisualReference !== 'string' || !metadata.primaryVisualReference.trim()) errors.push('Metadata requires primaryVisualReference.');
    if (metadata.frameWidth !== FRAME_SIZE || metadata.frameHeight !== FRAME_SIZE) errors.push(`Metadata frame size must be ${FRAME_SIZE}×${FRAME_SIZE}.`);
    if (!Array.isArray(metadata.deprecatedSourcesExcluded)) errors.push('Metadata requires deprecatedSourcesExcluded.');
    if (config.key === 'muse' && !metadata.deprecatedSourcesExcluded?.includes('static/models/muse.glb')) errors.push('Muse metadata must explicitly exclude static/models/muse.glb.');
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
        if (!sequence || !['authored', 'mirrored', 'temporary-fallback'].includes(sequence.source)) {
          errors.push(`${state}.${direction} requires an explicit authored, mirrored, or temporary-fallback source.`);
          continue;
        }
        const expectedPolicy = config.policy[state][direction];
        const expectedSource = expectedPolicy.split(':')[0];
        const expectedFrom = expectedPolicy.split(':')[1];
        if (sequence.source !== expectedSource && !(state === 'walk' && direction === 'ne' && sequence.source === 'authored') &&
          !(state === 'walk' && direction === 'nw' && sequence.source === 'mirrored')) errors.push(`${state}.${direction} violates the approved ${config.key} direction policy.`);
        if (sequence.source === 'authored' && (!Number.isInteger(sequence.frameCount) || sequence.frameCount < 1)) errors.push(`${state}.${direction} authored source requires a positive integer frameCount.`);
        if (sequence.source === 'mirrored' && (!DIRECTIONS.includes(sequence.from) || sequence.from === direction)) errors.push(`${state}.${direction} mirrored source requires a valid distinct "from" direction.`);
        if (sequence.source === 'temporary-fallback' && (!DIRECTIONS.includes(sequence.fallbackDirection) || sequence.temporary !== true)) errors.push(`${state}.${direction} fallback requires fallbackDirection and temporary: true.`);
        if (expectedFrom && sequence.source === expectedSource && (sequence.from ?? sequence.fallbackDirection) !== expectedFrom) errors.push(`${state}.${direction} must resolve from ${expectedFrom}.`);
        if (sequence.source !== 'authored' && sequence.frameCount !== undefined) errors.push(`${state}.${direction} derived/fallback entries must not declare frameCount.`);
        if (sequence?.fps !== undefined && (!Number.isFinite(sequence.fps) || sequence.fps <= 0)) errors.push(`${state}.${direction} FPS override must be positive.`);
        if (sequence?.loop !== undefined && typeof sequence.loop !== 'boolean') errors.push(`${state}.${direction} loop override must be boolean.`);
      }
      if (state === 'walk') {
        const ne = animation.directions?.ne;
        const nw = animation.directions?.nw;
        if (ne?.source === 'authored' && (nw?.source !== 'mirrored' || nw.from !== 'ne')) errors.push('walk.nw must be mirrored from walk.ne once authored NE artwork exists.');
        if (ne?.source === 'temporary-fallback' && (nw?.source !== 'temporary-fallback' || nw.fallbackDirection !== 'w')) errors.push('walk.nw must use the explicit W fallback while walk.ne is unavailable.');
      }
    }
    return metadata;
  } catch (error) {
    errors.push(`Invalid ${config.key}.production.json: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const cropCell = (sheet, column, row) => {
  const frame = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE, colorType: 6 });
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const sourceStart = ((row * FRAME_SIZE + y) * sheet.width + column * FRAME_SIZE) * 4;
    sheet.data.copy(frame.data, y * FRAME_SIZE * 4, sourceStart, sourceStart + FRAME_SIZE * 4);
  }
  return frame;
};

export const ingestMuseSheets = (sourceDirectory = DEFAULT_SOURCE) => {
  const root = resolve(sourceDirectory);
  const config = assetConfig(root);
  const errors = [];
  const metadata = readMetadata(root, errors);
  if (!metadata || errors.length) throw new Error(`Muse sheet intake metadata failed:\n${errors.map((item) => `- ${item}`).join('\n')}`);
  const written = [];
  for (const [state, sheets] of Object.entries(config.sheets)) for (const [direction, filename] of Object.entries(sheets)) {
    const definition = metadata.animations[state].directions[direction];
    if (definition?.source !== 'authored') throw new Error(`${state}.${direction} sheet requires authored metadata.`);
    const sheetPath = join(root, filename);
    if (!existsSync(sheetPath)) throw new Error(`Missing approved source sheet: ${filename}`);
    const sheet = PNG.sync.read(readFileSync(sheetPath), { skipRescale: true });
    if (sheet.width !== FRAME_SIZE * 5 || sheet.height !== FRAME_SIZE * 5) throw new Error(`${filename} must be a 5×5 grid of ${FRAME_SIZE}px cells.`);
    const populated = [];
    let reachedEmptyCell = false;
    for (let index = 0; index < 25; index += 1) {
      const frame = cropCell(sheet, index % 5, Math.floor(index / 5));
      let visible = false;
      for (let alpha = 3; alpha < frame.data.length; alpha += 4) if (frame.data[alpha] > 0) { visible = true; break; }
      if (visible) {
        if (reachedEmptyCell) throw new Error(`${filename} contains a populated cell after an empty grid position.`);
        populated.push(frame);
      } else reachedEmptyCell = true;
    }
    if (populated.length !== definition.frameCount) throw new Error(`${filename} contains ${populated.length} populated frames; metadata declares ${definition.frameCount}.`);
    const destination = join(root, 'frames', state, direction);
    mkdirSync(destination, { recursive: true });
    populated.forEach((frame, index) => {
      const path = expectedFramePath(root, state, direction, index);
      writeFileSync(path, PNG.sync.write(frame, { colorType: 6 }));
      written.push(path);
    });
  }
  return { sourceDirectory: root, writtenFrames: written.length, files: written };
};

export const validateMuseFrames = (sourceDirectory = DEFAULT_SOURCE) => {
  const root = resolve(sourceDirectory);
  const errors = [];
  const warnings = [];
  const metadata = readMetadata(root, errors);
  const expected = [];
  if (metadata) for (const state of REQUIRED_STATES) for (const direction of DIRECTIONS) {
    const definition = metadata.animations?.[state]?.directions?.[direction];
    const count = definition?.source === 'authored' ? definition.frameCount : 0;
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

const copyFrame = (target, source, column, mirrored = false) => {
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const targetStart = (y * target.width + column * FRAME_SIZE) * 4;
    if (!mirrored) {
      const sourceStart = y * FRAME_SIZE * 4;
      source.data.copy(target.data, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
    } else for (let x = 0; x < FRAME_SIZE; x += 1) {
      const sourcePixel = (y * FRAME_SIZE + (FRAME_SIZE - 1 - x)) * 4;
      const targetPixel = targetStart + x * 4;
      source.data.copy(target.data, targetPixel, sourcePixel, sourcePixel + 4);
    }
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
  const config = assetConfig(root);
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const pages = [];
  const atlasPaths = [];
  const directions = {};
  for (const state of REQUIRED_STATES) {
    directions[state] = {};
    for (const direction of DIRECTIONS) {
      const sequence = report.metadata.animations[state].directions[direction];
      if (sequence.source === 'temporary-fallback') {
        directions[state][direction] = { frames: [], source: 'temporary-fallback', fallbackDirection: sequence.fallbackDirection, temporary: true };
        continue;
      }
      const sourceDirection = sequence.source === 'mirrored' ? sequence.from : direction;
      const sourceSequence = report.metadata.animations[state].directions[sourceDirection];
      if (sourceSequence?.source !== 'authored') throw new Error(`${state}.${direction} must derive directly from authored frames.`);
      const frames = [];
      for (let pageIndex = 0, offset = 0; offset < sourceSequence.frameCount; pageIndex += 1, offset += FRAMES_PER_PAGE) {
        const count = Math.min(FRAMES_PER_PAGE, sourceSequence.frameCount - offset);
        const pageId = `${state}-${direction}-p${String(pageIndex + 1).padStart(2, '0')}`;
        const imageName = `${config.key}.${state}.${direction}.p${String(pageIndex + 1).padStart(2, '0')}.png`;
        const atlas = new PNG({ width: count * FRAME_SIZE, height: FRAME_SIZE, colorType: 6 });
        atlas.data.fill(0);
        for (let local = 0; local < count; local += 1) {
          const frameIndex = offset + local;
          copyFrame(atlas, PNG.sync.read(readFileSync(expectedFramePath(root, state, sourceDirection, frameIndex)), { skipRescale: true }), local, sequence.source === 'mirrored');
          frames.push({ page: pageId, column: local, row: 0 });
        }
        const atlasPath = join(output, imageName);
        writeFileSync(atlasPath, PNG.sync.write(atlas, { colorType: 6 }));
        atlasPaths.push(atlasPath);
        pages.push({ id: pageId, image: imageName, imageWidth: atlas.width, imageHeight: atlas.height });
      }
      directions[state][direction] = { frames, source: sequence.source === 'mirrored' ? `mirrored-from-${sourceDirection}` : 'authored',
        ...(sequence.fps !== undefined ? { fps: sequence.fps } : {}), ...(sequence.loop !== undefined ? { loop: sequence.loop } : {}) };
    }
  }
  const animationManifest = (state) => {
    const source = report.metadata.animations[state];
    return { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE, fps: source.fps, loop: source.loop, directions: directions[state],
      pivot: source.pivot, feet: source.feet, visualScale: source.visualScale,
      ...(source.shadow ? { shadow: source.shadow } : {}), ...(source.effectAnchors ? { effectAnchors: source.effectAnchors } : {}),
      ...(source.labelAnchor ? { labelAnchor: source.labelAnchor } : {}), ...(source.ownerSpacing ? { ownerSpacing: source.ownerSpacing } : {}) };
  };
  const manifest = { version: 2, id: `${config.key}-hd-production-v2`, status: 'production', pages, nativeDirections: true,
    directionOrder: DIRECTIONS, animations: { idle: animationManifest('idle'), walk: animationManifest('walk') } };
  const manifestPath = join(output, `${config.key}.atlas.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { report, atlasPaths, manifestPath, manifest };
};

const readOption = (args, name, fallback) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const runCli = () => {
  const [, , command, ...args] = process.argv;
  const source = readOption(args, '--source', DEFAULT_SOURCE);
  if (command === 'validate') { const report = validateMuseFrames(source); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ok ? 0 : 1; return; }
  if (command === 'ingest') { const result = ingestMuseSheets(source); console.log(JSON.stringify({ ok: true, writtenFrames: result.writtenFrames }, null, 2)); return; }
  if (command === 'pack') { const result = packMuseAtlas(source, readOption(args, '--output', DEFAULT_OUTPUT)); console.log(JSON.stringify({ ok: true, atlasPaths: result.atlasPaths, manifestPath: result.manifestPath }, null, 2)); return; }
  console.error('Usage: node scripts/world/muse-assets.mjs <ingest|validate|pack> [--source DIR] [--output DIR]');
  process.exitCode = 2;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
