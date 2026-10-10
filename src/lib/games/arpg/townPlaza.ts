import type { Vec2 } from './ecs/components';
import { TOWN_ENTRANCE_SOURCE_BOUNDS, type arpgViewportLayout } from './viewportLayout';

const cross = (a: Vec2, b: Vec2, p: Vec2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function pointSegmentDistanceSquared(point: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}
function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
      Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
function insideConvex(point: Vec2, polygon: readonly Vec2[]) {
  const sides = polygon.map((a, i) => cross(a, polygon[(i + 1) % polygon.length]!, point));
  return sides.every(value => value >= 0) || sides.every(value => value <= 0);
}

/** Exact swept circle against a convex foundation. No endpoint-only dash test. */
export function crossesTownFootprint(from: Vec2, to: Vec2, radius: number, polygon: readonly Vec2[]) {
  if (![from.x, from.y, to.x, to.y, radius].every(Number.isFinite)) return true;
  if (insideConvex(from, polygon) || insideConvex(to, polygon)) return true;
  const radiusSquared = Math.max(0, radius) ** 2;
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    return segmentsIntersect(from, to, a, b) || Math.min(
      pointSegmentDistanceSquared(from, a, b), pointSegmentDistanceSquared(to, a, b),
      pointSegmentDistanceSquared(a, from, to), pointSegmentDistanceSquared(b, from, to)
    ) <= radiusSquared;
  });
}

export const TOWN_CUTAWAY_ALPHA = 0.28;
// Conservative world envelope across the hero's directional frames, including
// equipment. This is an occlusion trigger, not a measured visible-body claim.
export const TOWN_ACTOR_ENVELOPE = { left: -64, right: 64, top: -96, bottom: 24 } as const;

/** Front-most foundation boundary at x, clamped to the nearest side endpoint. */
export function townFrontY(polygon: readonly Vec2[], actorX: number) {
  const x = Math.max(Math.min(...polygon.map(p => p.x)), Math.min(Math.max(...polygon.map(p => p.x)), actorX));
  let front = -Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) return;
    const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    front = Math.max(front, y);
  });
  return front;
}

function polygonsIntersect(a: readonly Vec2[], b: readonly Vec2[]) {
  return a.some(p => insideConvex(p, b)) || b.some(p => insideConvex(p, a)) ||
    a.some((p, i) => b.some((q, j) => segmentsIntersect(p, a[(i + 1) % a.length]!, q, b[(j + 1) % b.length]!)));
}

/** Town has one actor. A long face sorts at the actor's local front edge,
 * rather than hiding a front-side hero behind its lowest distant corner.
 * Behind a face, only the upper art cuts away; the solid foundation stays.
 * Lowering depth only preserves the existing shop/entrance ordering. */
export function townFacadePresentation(actor: Vec2, contact: Vec2, footprint: readonly Vec2[], upperPolygons: readonly (readonly Vec2[])[]) {
  const local = { x: actor.x - contact.x, y: actor.y - contact.y };
  const behind = local.y < townFrontY(footprint, local.x);
  const e = TOWN_ACTOR_ENVELOPE;
  const envelope = [{ x: local.x + e.left, y: local.y + e.top }, { x: local.x + e.right, y: local.y + e.top },
    { x: local.x + e.right, y: local.y + e.bottom }, { x: local.x + e.left, y: local.y + e.bottom }];
  const overlaps = upperPolygons.some(polygon => polygonsIntersect(polygon, envelope));
  const cutaway = behind && overlaps;
  return { depth: !behind && overlaps ? Math.min(contact.y + 20, actor.y + 19) : contact.y + 20, alpha: cutaway ? TOWN_CUTAWAY_ALPHA : 1 };
}

/** The entrance is a non-solid single-image arch, not a building foundation.
 * Its static foot depth stays intact. Fade only when the arch can cover a
 * behind/tied hero; equality matters because the arch was inserted after him. */
export function townPassageAlpha(actor: Vec2, contact: Vec2) {
  if (actor.y > contact.y) return 1;
  const e = TOWN_ACTOR_ENVELOPE, b = TOWN_ENTRANCE_SOURCE_BOUNDS;
  const x = actor.x - contact.x, y = actor.y - contact.y;
  const overlaps = x + e.right >= b.left && x + e.left <= b.right &&
    y + e.bottom >= b.top && y + e.top <= b.bottom;
  return overlaps ? TOWN_CUTAWAY_ALPHA : 1;
}

/** Fixed zoom. Preserve gate/arrival context locally; reveal peripheral town by
 * following exploration, never by squeezing the entire plaza onto a phone. */
export function townExplorationOffset(layout: ReturnType<typeof arpgViewportLayout>, actor: Vec2, spawn: Vec2, gate: Vec2) {
  const base = layout.camera, zoom = base.zoom;
  const gateDistance = Math.hypot(actor.x - gate.x, actor.y - gate.y);
  const distance = Math.min(Math.hypot(actor.x - spawn.x, actor.y - spawn.y), gateDistance);
  const context = 1 - Math.max(0, Math.min(1, (distance - 96) / 96));
  let heroX = layout.width / 2 + base.offsetX * context * zoom;
  let heroY = layout.height / 2 + base.offsetY * zoom;
  const initialX = heroX, initialY = heroY;
  // Approach from either side. Within160world pixels (including the150px
  // interaction radius), the arch and its up-to120px prompt fit beside the hero.
  // Blend outside that zone so peripheral exploration has no framing snap.
  const gateContext = Math.max(0, Math.min(1, (224 - gateDistance) / 64));
  if (gateContext > 0) {
    const source = TOWN_ENTRANCE_SOURCE_BOUNDS;
    const dx = (gate.x - actor.x) * zoom, dy = (gate.y - actor.y) * zoom;
    const promptScale = layout.compact ? 1 : zoom;
    const left = Math.min(dx + source.left * zoom, dx - 60 * promptScale);
    const right = Math.max(dx + source.right * zoom, dx + 60 * promptScale);
    const top = dy + source.top * zoom;
    const bottom = Math.max(dy + source.bottom * zoom, dy + 40 * zoom + 12 * promptScale);
    // Desktop panels occupy the left side, not full-width strips. A nearby
    // gate and hero share the unobstructed right column; compact uses its band.
    const safeLeft = layout.compact ? 12 : Math.max(layout.hud.x + layout.hud.width, layout.controls.x + layout.controls.width) + 12;
    const minX = Math.max(24 + 64 * zoom, safeLeft - left, layout.compact ? 0 : safeLeft + 64 * zoom);
    const maxX = Math.min(layout.width - 24 - 64 * zoom, layout.width - 12 - right);
    const minY = (layout.compact ? layout.hud.y + layout.hud.height : 0) + 12 + Math.max(96 * zoom, -top);
    const maxY = (layout.compact ? layout.controls.y : layout.height) - 12 - Math.max(24 * zoom, bottom);
    // Tiny unsupported viewports may not fit both full source padding and the
    // actor. Do not move the hero under UI to pretend that impossible fit works.
    if (minX <= maxX) heroX += (Math.max(minX, Math.min(maxX, heroX)) - heroX) * gateContext;
    if (minY <= maxY) heroY += (Math.max(minY, Math.min(maxY, heroY)) - heroY) * gateContext;
  }
  return { offsetX: base.offsetX * context + (heroX - initialX) / zoom, offsetY: base.offsetY + (heroY - initialY) / zoom };
}
