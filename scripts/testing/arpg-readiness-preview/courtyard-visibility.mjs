// Read-only source-alpha diagnostic. This does not render Graphics, capture GPU
// pixels, or replace native screenshot review. Phaser 3.90 GraphicsWebGLRenderer
// applies object/camera alpha separately to EACH FILL_PATH; overlapping fills
// therefore compound even when they belong to the same Graphics object.
// https://github.com/phaserjs/phaser/blob/v3.90.0/src/gameobjects/graphics/GraphicsWebGLRenderer.js
import { COURTYARD_NAMES } from './courtyard-graphics.mjs';

export const COURTYARD_VISIBILITY_LIMITS = Object.freeze({
  worldObjects: 256, renderedObjects: 512, commandsPerWall: 256,
  framePixels: 4194304, totalFramePixels: 33554432, sampleCandidates: 16384
});
const METHOD = 'analytic-source-transmission';
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
const unit = n => finite(n) && n >= 0 && n <= 1;
const color = n => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffff;
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const inside = (x, y, polygon) => {
  const sides = polygon.map((p, i) => cross(p, polygon[(i + 1) % polygon.length], [x, y]));
  // Include edges conservatively; raster coverage/antialiasing is not inferred.
  return sides.every(v => v >= -1e-9) || sides.every(v => v <= 1e-9);
};

/** Strictly accept the actual bounded command grammar emitted by the approved
 * wall: one default style prefix, three closed convex quadrilateral fills.
 * Coordinates/colors/alphas are READ, never regenerated from approved geometry.
 * The independent exact-geometry verifier remains responsible for art approval. */
export function readCourtyardFills(commands) {
  requireThat(Array.isArray(commands) && commands.length <= COURTYARD_VISIBILITY_LIMITS.commandsPerWall, 'Missing or excessive Graphics command buffer');
  requireThat(commands.length === 67 && [6, 1, 0, 0, 7, 0, 0].every((v, i) => commands[i] === v), 'Unsupported Graphics command grammar/prefix');
  const fills = [];
  let cursor = 7;
  const take = () => commands[cursor++];
  for (let fillIndex = 0; fillIndex < 3; fillIndex++) {
    requireThat(take() === 7, 'Expected FILL_STYLE');
    const fillColor = take(), alpha = take();
    requireThat(color(fillColor) && unit(alpha), 'Invalid fill color/alpha');
    requireThat(take() === 1 && take() === 5, 'Expected BEGIN_PATH and MOVE_TO');
    const points = [[take(), take()]];
    for (let point = 0; point < 3; point++) {
      requireThat(take() === 4, 'Expected LINE_TO'); points.push([take(), take()]);
    }
    requireThat(take() === 4 && take() === points[0][0] && take() === points[0][1] && take() === 8, 'Unclosed or unsupported fill path');
    requireThat(points.every(p => p.every(finite)), 'Nonfinite/out-of-range polygon point');
    const turns = points.map((p, i) => cross(p, points[(i + 1) % 4], points[(i + 2) % 4]));
    requireThat(turns.every(v => v > 1e-9) || turns.every(v => v < -1e-9), 'Nonconvex, degenerate or self-intersecting wall fill');
    fills.push({ fillIndex, color: fillColor, alpha, points });
  }
  requireThat(cursor === commands.length, 'Unconsumed Graphics commands');
  return fills;
}

const matrix = value => {
  const values = [value?.a, value?.b, value?.c, value?.d, value?.e, value?.f];
  requireThat(values.every(finite) && Math.abs(values[0] * values[3] - values[1] * values[2]) > 1e-10, 'Missing, nonfinite or singular world/camera transform');
  return values;
};
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const inverse = (m, x, y) => {
  const determinant = m[0] * m[3] - m[1] * m[2], dx = x - m[4], dy = y - m[5];
  return [(m[3] * dx - m[2] * dy) / determinant, (-m[1] * dx + m[0] * dy) / determinant];
};
const descriptor = (object, id, index, painterIndex) => {
  requireThat(object && [object.x, object.y, object.scaleX, object.scaleY, object.rotation, object.depth, object.scrollFactorX, object.scrollFactorY].every(finite), 'Invalid object transform/depth/scroll factor');
  requireThat(unit(object.alpha) && typeof object.active === 'boolean' && typeof object.visible === 'boolean', 'Invalid object alpha/state');
  requireThat(!object.parentContainer && !object.mask && object.blendMode === 0 && object.hasPostPipeline !== true && !object.isCropped,
    'Unsupported container, mask, blend, post-pipeline or crop');
  requireThat(!object.preFX?.list?.length && !object.postFX?.list?.length, 'Unsupported object effects');
  for (const corner of ['alphaTopLeft', 'alphaTopRight', 'alphaBottomLeft', 'alphaBottomRight']) {
    requireThat(object[corner] === undefined || object[corner] === object.alpha, 'Unsupported per-corner alpha');
  }
  requireThat(typeof object.getWorldTransformMatrix === 'function', 'Missing actual world transform');
  const objectId = id(object);
  requireThat(Number.isSafeInteger(objectId) && objectId > 0, 'Invalid object identity');
  return { objectId, name: object.name || object.texture?.key || '', type: object.type,
    worldIndex: index, painterIndex, depth: object.depth, alpha: object.alpha, active: object.active, visible: object.visible,
    x: object.x, y: object.y, scaleX: object.scaleX, scaleY: object.scaleY, rotation: object.rotation,
    scrollFactorX: object.scrollFactorX, scrollFactorY: object.scrollFactorY,
    worldMatrix: matrix(object.getWorldTransformMatrix()) };
};

/** Inspect real Phaser objects after POST_RENDER. Dependency arguments expose
 * read-only engine classes/source decoders for the adapter and offline tests.
 * Bounds and failures are explicit; no truncation can yield a passing result. */
export function observeCourtyardVisibility({ worldLayer, owned, hero, camera, portalText, viewport,
  Graphics, Image, Sprite, Text, objectId, decodedPixels, decodedAlphaBounds }) {
  const result = { method: METHOD, nativePixels: false, valid: false, issues: [], alphaThreshold: 128, sampleStep: 3,
    samples: 0, readable: 0, meanTransmission: null, occluders: [], hero: null, camera: null,
    viewport: null, walls: [], images: [], excludedText: [], painterOrder: [] };
  try {
    const world = worldLayer?.list, rendered = camera?.renderList;
    requireThat(Array.isArray(world) && world.length <= COURTYARD_VISIBILITY_LIMITS.worldObjects, 'Missing or excessive world list');
    requireThat(Array.isArray(rendered) && rendered.length <= COURTYARD_VISIBILITY_LIMITS.renderedObjects, 'Missing or excessive post-render painter list');
    requireThat(new Set(world).size === world.length && new Set(rendered).size === rendered.length, 'Duplicate world/rendered object');
    requireThat(worldLayer.alpha === 1 && worldLayer.visible === true && !worldLayer.parentContainer && !worldLayer.mask && worldLayer.hasPostPipeline !== true && (worldLayer.blendMode === -1 || worldLayer.blendMode === 0),
      'Unsupported world layer state');
    requireThat([camera.scrollX, camera.scrollY].every(finite) && camera.alpha === 1, 'Invalid camera scroll/alpha');
    // Phaser3.90 Flash initializes/restores alpha=1 even while idle, but both
    // render paths draw only when isRunning. Fade may draw after completion.
    requireThat(!camera.fadeEffect?.isRunning && !camera.flashEffect?.isRunning && !(camera.fadeEffect?.alpha > 0), 'Unsupported camera fade/flash');
    // Phaser 3.90 Camera initializes PostPipeline even without FX. Its default
    // postFX.list stays empty for POST effects too: they live in postPipelines.
    // Check both sources (and malformed states), never list length alone.
    requireThat(camera.mask === null, 'Unsupported or malformed camera mask');
    requireThat(camera.hasPostPipeline === false && Array.isArray(camera.postPipelines) && camera.postPipelines.length === 0,
      'Unsupported or malformed camera post-pipelines');
    requireThat(camera.preFX === null && camera.postFX && camera.postFX.isPost === true && camera.postFX.enabled === false &&
      Array.isArray(camera.postFX.list) && camera.postFX.list.length === 0,
      'Unsupported or malformed camera FX');
    result.camera = { scrollX: camera.scrollX, scrollY: camera.scrollY, alpha: camera.alpha, matrix: matrix(camera.matrix) };
    requireThat(viewport && [viewport.css?.x, viewport.css?.y].every(finite) && [viewport.css?.width, viewport.css?.height, viewport.backing?.width, viewport.backing?.height, viewport.logical?.width, viewport.logical?.height].every(n => finite(n) && n > 0), 'Invalid CSS/backing/logical viewport');
    result.viewport = { css: { ...viewport.css }, backing: { ...viewport.backing }, logical: { ...viewport.logical } };
    const indices = new Map(world.map((object, index) => [object, index]));
    const paint = new Map(rendered.map((object, index) => [object, index]));
    requireThat(hero instanceof Sprite && indices.has(hero) && paint.has(hero), 'Missing or mistyped rendered hero');
    requireThat(hero.active && hero.visible && hero.alpha === 1, 'Inactive, invisible or non-opaque hero');
    let previousDepth = -Infinity;
    for (const object of world) {
      requireThat(object && finite(object.depth) && object.depth >= previousDepth, 'Unsorted or invalid post-render world depths');
      previousDepth = object.depth;
    }
    let previousIndex = -1;
    for (const object of rendered) {
      if (!indices.has(object)) {
        requireThat(object === worldLayer, 'Unknown object in main-camera render list');
        continue;
      }
      const index = indices.get(object);
      requireThat(index > previousIndex, 'Painter order disagrees with post-render world order');
      previousIndex = index;
    }
    const refs = [owned?.perimeter, owned?.backdrop, ...(Array.isArray(owned?.courtyard) ? owned.courtyard : [])];
    const names = ['town-perimeter-rim', 'town-exterior-backdrop', ...COURTYARD_NAMES];
    requireThat(refs.length === 6 && new Set(refs).size === 6 && refs.every((o, i) => o instanceof Graphics && o.name === names[i] && indices.has(o) && paint.has(o)),
      'Exactly two original and four owned rendered Graphics references required');
    requireThat(world.filter(o => o instanceof Graphics).every(o => refs.includes(o)), 'Unexpected world Graphics');
    const heroPaint = paint.get(hero);
    requireThat(refs.slice(0, 2).every(o => o.depth < hero.depth && paint.get(o) < heroPaint), 'Original ground/backdrop Graphics must remain below hero');
    result.hero = descriptor(hero, objectId, indices.get(hero), heroPaint);
    const wallData = new Map();
    for (const wall of refs.slice(2)) {
      const record = descriptor(wall, objectId, indices.get(wall), paint.get(wall));
      requireThat(record.active && record.visible && record.alpha > 0, 'Inactive, invisible or transparent owned wall');
      record.fills = readCourtyardFills(wall.commandBuffer).map(fill => ({ ...fill, intersectedSamples: 0, contributingSamples: 0 }));
      record.intersectedSamples = 0; record.contributingSamples = 0;
      record.commands = [...wall.commandBuffer]; record.aboveHero = record.painterIndex > heroPaint;
      result.walls.push(record); wallData.set(wall, record);
    }
    let decodedArea = 0;
    const sources = new Map();
    const source = object => {
      const frame = object.frame;
      requireThat(frame && Number.isSafeInteger(frame.cutWidth) && Number.isSafeInteger(frame.cutHeight) && frame.cutWidth > 0 && frame.cutHeight > 0 && frame.cutWidth * frame.cutHeight <= COURTYARD_VISIBILITY_LIMITS.framePixels,
        'Missing or excessive source frame');
      requireThat([frame.x, frame.y, object.displayOriginX, object.displayOriginY].every(finite) && typeof object.flipX === 'boolean' && typeof object.flipY === 'boolean' && !frame.rotated,
        'Unsupported source frame/origin/flip');
      if (!sources.has(frame)) {
        decodedArea += frame.cutWidth * frame.cutHeight;
        requireThat(decodedArea <= COURTYARD_VISIBILITY_LIMITS.totalFramePixels, 'Total decoded source budget exceeded');
        const pixels = decodedPixels(frame);
        requireThat(pixels && pixels.width === frame.cutWidth && pixels.height === frame.cutHeight && pixels.data instanceof Uint8ClampedArray && pixels.data.length === pixels.width * pixels.height * 4, 'Malformed decoded source pixels');
        sources.set(frame, pixels);
      }
      return sources.get(frame);
    };
    const heroPixels = source(hero), bounds = decodedAlphaBounds(hero.frame);
    requireThat(bounds && ['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(bounds[k])) && bounds.x >= 0 && bounds.y >= 0 && bounds.width > 0 && bounds.height > 0 && bounds.x + bounds.width <= heroPixels.width && bounds.y + bounds.height <= heroPixels.height,
      'Missing or malformed hero source-alpha bounds');
    result.hero.frame = { x: hero.frame.x, y: hero.frame.y, width: heroPixels.width, height: heroPixels.height,
      displayOriginX: hero.displayOriginX, displayOriginY: hero.displayOriginY, flipX: hero.flipX, flipY: hero.flipY,
      sourceBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
    requireThat(Math.ceil(bounds.width / 3) * Math.ceil(bounds.height / 3) <= COURTYARD_VISIBILITY_LIMITS.sampleCandidates, 'Hero sample budget exceeded');
    const above = [];
    for (let painterIndex = 0; painterIndex < rendered.length; painterIndex++) {
      const object = rendered[painterIndex];
      if (!indices.has(object)) continue;
      result.painterOrder.push({ objectId: objectId(object), name: object.name || object.texture?.key || '', type: object.type, depth: object.depth, worldIndex: indices.get(object), painterIndex });
      if (painterIndex <= heroPaint) continue;
      requireThat(object.active && object.visible && object.alpha > 0, 'Rendered above-hero object has invalid visibility');
      if (object instanceof Graphics) {
        requireThat(wallData.has(object), 'Unexpected above-hero Graphics');
        above.push({ kind: 'fills', object, record: wallData.get(object) });
      } else if (object instanceof Image) {
        const record = descriptor(object, objectId, indices.get(object), painterIndex), pixels = source(object);
        record.textureKey = object.texture.key;
        record.frame = { x: object.frame.x, y: object.frame.y, width: pixels.width, height: pixels.height, displayOriginX: object.displayOriginX, displayOriginY: object.displayOriginY, flipX: object.flipX, flipY: object.flipY };
        result.images.push(record); above.push({ kind: 'image', object, record, pixels });
      } else if (object === portalText && object instanceof Text) {
        // The original prompt is a known non-image. It can only be excluded
        // after proving no sampled hero source point intersects its local box.
        const record = descriptor(object, objectId, indices.get(object), painterIndex);
        requireThat([object.width, object.height, object.displayOriginX, object.displayOriginY].every(finite) && object.width >= 0 && object.height >= 0, 'Malformed original prompt bounds');
        record.localBounds = { x: -object.displayOriginX, y: -object.displayOriginY, width: object.width, height: object.height };
        result.excludedText.push(record); above.push({ kind: 'text', object, record });
      } else throw Error('Unsupported rendered above-hero object type');
    }
    requireThat(new Set(result.painterOrder.map(o => o.objectId)).size === result.painterOrder.length, 'Colliding observed object identities');
    const occluders = new Set();
    let samples = 0, readable = 0, total = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 3) for (let x = bounds.x; x < bounds.x + bounds.width; x += 3) {
      if (heroPixels.data[(y * heroPixels.width + x) * 4 + 3] < 128) continue;
      const localX = hero.frame.x + (hero.flipX ? heroPixels.width - x - .5 : x + .5) - hero.displayOriginX;
      const localY = hero.frame.y + (hero.flipY ? heroPixels.height - y - .5 : y + .5) - hero.displayOriginY;
      const point = transform(result.hero.worldMatrix, localX, localY);
      let transmission = 1;
      for (const entry of above) {
        const { object, record } = entry;
        const [px, py] = inverse(record.worldMatrix,
          point[0] - camera.scrollX * (hero.scrollFactorX - object.scrollFactorX),
          point[1] - camera.scrollY * (hero.scrollFactorY - object.scrollFactorY));
        requireThat(finite(px) && finite(py), 'Invalid transformed sample');
        if (entry.kind === 'fills') {
          let intersects = false, contributes = false;
          for (const fill of record.fills) if (inside(px, py, fill.points)) {
            fill.intersectedSamples++; intersects = true;
            const alpha = fill.alpha * record.alpha * camera.alpha;
            transmission *= 1 - alpha;
            if (alpha > 0) { fill.contributingSamples++; contributes = true; occluders.add(record.name); }
          }
          if (intersects) record.intersectedSamples++;
          if (contributes) record.contributingSamples++;
        } else if (entry.kind === 'text') {
          const box = record.localBounds;
          requireThat(px < box.x || py < box.y || px > box.x + box.width || py > box.y + box.height, 'Original prompt overlaps hero samples; analytic image/vector scope insufficient');
        } else {
          let ix = px + object.displayOriginX - object.frame.x, iy = py + object.displayOriginY - object.frame.y;
          if (object.flipX) ix = entry.pixels.width - ix;
          if (object.flipY) iy = entry.pixels.height - iy;
          ix = Math.floor(ix); iy = Math.floor(iy);
          if (ix < 0 || iy < 0 || ix >= entry.pixels.width || iy >= entry.pixels.height) continue;
          const alpha = entry.pixels.data[(iy * entry.pixels.width + ix) * 4 + 3] / 255 * record.alpha * camera.alpha;
          transmission *= 1 - alpha;
          if (alpha > 0) occluders.add(record.name);
        }
      }
      samples++; total += transmission; if (transmission >= .5) readable++;
    }
    requireThat(samples > 0, 'No threshold-128 hero source samples');
    Object.assign(result, { valid: true, samples, readable, meanTransmission: total / samples, occluders: [...occluders].sort() });
  } catch (error) {
    result.issues = [error instanceof Error ? error.message : 'Unknown observation failure'];
  }
  return result;
}
