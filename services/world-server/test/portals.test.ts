import { describe, expect, it } from 'vitest';
import { WORLD_MAPS, isValidWorldPosition } from '../src/world/maps.js';
import { parsePortalRequest, resolvePortal, WORLD_AREAS } from '../src/world/portals.js';
import { WORLD_NPCS, npcPositionAt } from '../src/world/npcs.js';
import { applyMovement } from '../src/simulation/movement.js';

const requestId = '11111111-1111-4111-8111-111111111111';
describe('connected area authority', () => {
  it('admits only the two exact request fields and fixed portal IDs', () => {
    expect(parsePortalRequest({ requestId, portalId: 'grove-to-hollow' })).toEqual({ requestId, portalId: 'grove-to-hollow' });
    for (const value of [null, [], {}, { requestId, portalId: 'elsewhere' }, { requestId: 'x'.repeat(3000), portalId: 'grove-to-hollow' },
      ...['x', 'y', 'targetMapId', 'userId', 'mapId'].map((key) => ({ requestId, portalId: 'grove-to-hollow', [key]: 999 }))]) {
      expect(parsePortalRequest(value)).toBeNull();
    }
  });
  it.each(Object.values(WORLD_MAPS))('validates %s portal range and source map', (map) => {
    const portal = WORLD_AREAS[map.id].portal;
    const target = resolvePortal(map, portal.id, portal)!;
    expect(target.destination.id).toBe(portal.targetMapId);
    expect(isValidWorldPosition(target.destination, target.arrival)).toBe(true);
    expect(resolvePortal(map, portal.id, { x: portal.x, y: portal.y + 54 })).not.toBeNull();
    expect(resolvePortal(map, portal.id, { x: portal.x, y: portal.y + 54.01 })).toBeNull();
    expect(resolvePortal(map, 'unknown', portal)).toBeNull();
    expect(resolvePortal(map, portal.id, { x: NaN, y: 270 })).toBeNull();
    const reverse = WORLD_AREAS[target.destination.id].portal;
    expect(Math.hypot(target.arrival.x - reverse.x, target.arrival.y - reverse.y)).toBeGreaterThan(reverse.radius);
    expect(isValidWorldPosition(map, map.spawn)).toBe(true);
  });
  it.each(Object.values(WORLD_MAPS))('keeps the full central path open in %s', (map) => {
    let position = { x: 17, y: 270 };
    for (let step = 0; step < 45; step++) position = applyMovement(position, { x: 1, y: 0 }, 100, map.traversal);
    expect(position.x).toBe(944);
  });
});

describe('deterministic authored residents', () => {
  it('has two residents in separate areas with no account identity', () => {
    expect(WORLD_NPCS).toHaveLength(2);
    expect(new Set(WORLD_NPCS.map((npc) => npc.mapId)).size).toBe(2);
    expect(JSON.stringify(WORLD_NPCS)).not.toMatch(/userId|owner_id|companionId|journal|inventory|prompt/);
  });
  it.each(WORLD_NPCS)('keeps every route segment, closing segment and pause walkable for $name', (npc) => {
    const map = WORLD_MAPS[npc.mapId];
    for (let i = 0; i < npc.route.length; i++) {
      const a = npc.route[i]!; const b = npc.route[(i + 1) % npc.route.length]!;
      for (let step = 0; step <= 100; step++) {
        expect(isValidWorldPosition(map, { x: a.x + (b.x - a.x) * step / 100, y: a.y + (b.y - a.y) * step / 100 })).toBe(true);
      }
    }
    expect(npcPositionAt(npc, 0)).toMatchObject({ ...npc.route[0], moving: false });
    expect(npcPositionAt(npc, npc.pauseMs + 500).moving).toBe(true);
    expect(npcPositionAt(npc, 54_321)).toEqual(npcPositionAt(npc, 54_321));
    expect(npcPositionAt(npc, NaN)).toEqual(npcPositionAt(npc, 0));
    for (let t = 0; t < 120_000; t += 250) expect(isValidWorldPosition(map, npcPositionAt(npc, t))).toBe(true);
  });
});
