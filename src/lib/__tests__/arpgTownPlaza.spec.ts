import { describe, expect, it } from 'vitest';
import { crossesTownFootprint, townFacadePresentation, townFrontY, townExplorationOffset, TOWN_CUTAWAY_ALPHA } from '../games/arpg/townPlaza';
import { TOWN_FACADES } from '../games/arpg/assets/townFacadeData';
import { TOWN_CORNER_LAYOUT } from '../games/arpg/assets/townCorner';
import { arpgViewportLayout, TOWN_ENTRANCE_SOURCE_BOUNDS } from '../games/arpg/viewportLayout';

const spawn = { x: 1472, y: 536 }, gate = { x: 1728, y: 664 };
const world = (facade: typeof TOWN_FACADES[number]) => facade.footprint.map(p => ({ x: p.x + facade.contact.x, y: p.y + facade.contact.y }));
const shop = TOWN_CORNER_LAYOUT.shopFootprint.map(p => ({ x: p.x + 1664, y: p.y + 568 }));
const solids = () => [shop, ...TOWN_FACADES.map(world)];

describe('larger town foundations and actor-aware presentation (pure geometry)', () => {
  it('uses the full four-cell exact-grid foundations, not enlarged compact sprites', () => {
    expect(TOWN_FACADES.map(world)).toEqual([
      [{ x: 1240, y: 304 }, { x: 1304, y: 272 }, { x: 1560, y: 400 }, { x: 1496, y: 432 }],
      [{ x: 1728, y: 376 }, { x: 1984, y: 248 }, { x: 1920, y: 216 }, { x: 1664, y: 344 }]
    ]);
    for (const facade of TOWN_FACADES) {
      facade.footprint.forEach((a, i) => {
        const b = facade.footprint[(i + 1) % 4]!;
        expect(Math.abs((b.y - a.y) / (b.x - a.x))).toBe(0.5);
      });
      expect(facade.layers.foundation.scale).toBe(0.5);
      expect(facade.layers.upper.scale).toBe(0.5);
      expect(facade.layers.foundation.width).toBe(facade.layers.upper.width);
      expect(facade.layers.foundation.height).toBe(facade.layers.upper.height);
      expect(facade.layers.foundation.originX).toBe(facade.layers.upper.originX);
      expect(facade.layers.foundation.originY).toBe(facade.layers.upper.originY);
    }
  });

  it.each(['rear', 'endcap'])('blocks a crossing 230px dash with legal start and endpoint at %s', id => {
    const facade = TOWN_FACADES.find(f => f.id === id)!;
    const polygon = world(facade);
    // The long front face has a 57.24px normal thickness. Start/end outside
    // radius38 while the complete230px ray crosses the solid in between.
    const a = polygon[0]!, b = polygon[1]!;
    const c = id === 'rear' ? polygon[3]! : a;
    const d = id === 'rear' ? a : b;
    const midpoint = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    const dx = d.x - c.x, dy = d.y - c.y, length = Math.hypot(dx, dy);
    const normal = { x: -dy / length, y: dx / length };
    // Choose the lower/front outward normal independently of polygon winding.
    if (normal.y < 0) { normal.x *= -1; normal.y *= -1; }
    const from = { x: midpoint.x + normal.x * 42, y: midpoint.y + normal.y * 42 };
    const to = { x: from.x - normal.x * 230, y: from.y - normal.y * 230 };
    expect(crossesTownFootprint(from, from, 38, polygon)).toBe(false);
    expect(crossesTownFootprint(to, to, 38, polygon)).toBe(false);
    expect(crossesTownFootprint(from, to, 38, polygon)).toBe(true);
    expect(crossesTownFootprint(to, from, 38, polygon)).toBe(true);
  });

  it('keeps the spawn, gate and direct departure route legal for the actual radius38', () => {
    for (const polygon of solids()) {
      expect(crossesTownFootprint(spawn, spawn, 38, polygon)).toBe(false);
      expect(crossesTownFootprint(gate, gate, 38, polygon)).toBe(false);
      expect(crossesTownFootprint(spawn, gate, 38, polygon)).toBe(false);
    }
    expect(crossesTownFootprint(spawn, gate, 50, shop)).toBe(true); // Limiting49.19px clearance is not rounded up.
  });

  it('blocks corner tangency and stationary overlap but permits disjoint collinear motion', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(crossesTownFootprint({ x: -3, y: -4 }, { x: -3, y: -4 }, 5, square)).toBe(true);
    expect(crossesTownFootprint({ x: -3, y: -4 }, { x: -3, y: -4 }, 4.99, square)).toBe(false);
    expect(crossesTownFootprint({ x: 20, y: 0 }, { x: 30, y: 0 }, 0, square)).toBe(false);
    expect(crossesTownFootprint({ x: 5, y: 5 }, { x: 5, y: 5 }, 0, square)).toBe(true);
    expect(crossesTownFootprint({ x: NaN, y: 0 }, { x: 0, y: 0 }, 38, square)).toBe(true);
  });

  it.each(['rear', 'endcap'])('cuts away only overlapping upper art behind %s and restores it on exit', id => {
    const f = TOWN_FACADES.find(f => f.id === id)!;
    const behind = id === 'rear' ? { x: 1368, y: 210 } : { x: 1680, y: 260 };
    const front = id === 'rear' ? { x: 1368, y: 430 } : { x: 1856, y: 380 };
    expect(crossesTownFootprint(behind, behind, 38, world(f))).toBe(false);
    expect(crossesTownFootprint(front, front, 38, world(f))).toBe(false);
    expect(townFacadePresentation(behind, f.contact, f.footprint, f.upperPolygons)).toEqual({ depth: f.contact.y + 20, alpha: TOWN_CUTAWAY_ALPHA });
    const visible = townFacadePresentation(front, f.contact, f.footprint, f.upperPolygons);
    expect(visible.alpha).toBe(1);
    expect(visible.depth).toBeLessThan(front.y + 20);
    expect(townFacadePresentation({ x: 600, y: 100 }, f.contact, f.footprint, f.upperPolygons)).toEqual({ depth: f.contact.y + 20, alpha: 1 });
    expect(townFacadePresentation(spawn, f.contact, f.footprint, f.upperPolygons)).toEqual({ depth: f.contact.y + 20, alpha: 1 });
  });

  it('sorts a long face at the local actor edge instead of its distant lowest contact', () => {
    const rear = TOWN_FACADES[0]!;
    const actor = { x: 1280, y: 385 }; // In front of left bay, above lowest432px contact.
    const p = townFacadePresentation(actor, rear.contact, rear.footprint, rear.upperPolygons);
    expect(p).toEqual({ depth: actor.y + 19, alpha: 1 });
    expect(townFrontY(rear.footprint, actor.x - rear.contact.x) + rear.contact.y).toBe(324);
    expect(townFrontY(rear.footprint, -10000)).toBe(-128);
    expect(townFrontY(rear.footprint, 10000)).toBe(-32);
  });

  it.each([[374, 498.65625], [390, 844], [1068, 600.75]])('keeps zoom/readability and restores local context at %sx%s', (width, height) => {
    const layout = arpgViewportLayout(width, height, true);
    const base = layout.camera;
    expect(townExplorationOffset(layout, spawn, spawn, gate)).toEqual({ offsetX: base.offsetX, offsetY: base.offsetY });
    expect(townExplorationOffset(layout, gate, spawn, gate).offsetX).toBeGreaterThanOrEqual(base.offsetX);
    const far = townExplorationOffset(layout, { x: 1200, y: 260 }, spawn, gate);
    expect(far).toEqual({ offsetX: 0, offsetY: base.offsetY });
    const halfway = townExplorationOffset(layout, { x: spawn.x - 144, y: spawn.y }, spawn, gate);
    expect(halfway.offsetX).toBeCloseTo(base.offsetX / 2);
    const zoom = base.zoom;
    expect(base).toEqual(arpgViewportLayout(width, height, true).camera); // No mutation/zoom changes.
    expect(46 * zoom).toBeGreaterThanOrEqual(24);
    for (const offset of [base, far, halfway]) {
      const heroY = height / 2 + offset.offsetY * zoom;
      expect(heroY - 96 * zoom).toBeGreaterThan(layout.hud.y + layout.hud.height + 12);
      expect(heroY + 24 * zoom).toBeLessThan(layout.controls.y - 12);
    }
  });
  it.each([[320, 480], [374, 498.65625], [390, 520], [640, 480], [768, 480], [800, 600], [960, 480], [1068, 360], [1068, 600.75]])('fits gate context from every approach at %sx%s without changing hero scale', (width, height) => {
    const layout = arpgViewportLayout(width, height, true), zoom = layout.camera.zoom;
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const actor = { x: gate.x + Math.cos(angle) * 150, y: gate.y + Math.sin(angle) * 150 };
      const offset = townExplorationOffset(layout, actor, spawn, gate);
      const heroX = width / 2 + offset.offsetX * zoom, heroY = height / 2 + offset.offsetY * zoom;
      const gateX = heroX + (gate.x - actor.x) * zoom, gateY = heroY + (gate.y - actor.y) * zoom;
      const b = TOWN_ENTRANCE_SOURCE_BOUNDS;
      expect(gateX + b.left * zoom).toBeGreaterThanOrEqual(12 - 1e-8);
      expect(gateX + b.right * zoom).toBeLessThanOrEqual(width - 12 + 1e-8);
      expect(gateX - 60).toBeGreaterThanOrEqual(12 - 1e-8);
      expect(gateX + 60).toBeLessThanOrEqual(width - 12 + 1e-8);
      const top = layout.compact ? layout.hud.y + layout.hud.height : 0;
      const bottom = layout.compact ? layout.controls.y : height;
      expect(gateY + b.top * zoom).toBeGreaterThanOrEqual(top + 12 - 1e-8);
      expect(gateY + 40 * zoom + 12 * (layout.compact ? 1 : zoom)).toBeLessThanOrEqual(bottom - 12 + 1e-8);
      expect(heroY - 96 * zoom).toBeGreaterThanOrEqual(top + 12 - 1e-8);
      expect(heroY + 24 * zoom).toBeLessThanOrEqual(bottom - 12 + 1e-8);
      if (!layout.compact) {
        const panelRight = Math.max(layout.hud.x + layout.hud.width, layout.controls.x + layout.controls.width);
        expect(heroX - 64 * zoom).toBeGreaterThanOrEqual(panelRight + 12 - 1e-8);
        expect(gateX + b.left * zoom).toBeGreaterThanOrEqual(panelRight + 12 - 1e-8);
        expect(gateX - 60 * zoom).toBeGreaterThanOrEqual(panelRight + 12 - 1e-8);
      }
      expect(heroX - 64 * zoom).toBeGreaterThanOrEqual(24 - 1e-8);
      expect(heroX + 64 * zoom).toBeLessThanOrEqual(width - 24 + 1e-8);
    }
  });

  it('blends the gate context continuously instead of jumping at its edge', () => {
    const layout = arpgViewportLayout(374, 498.65625, true);
    let previous = townExplorationOffset(layout, { x: gate.x + 250, y: gate.y }, spawn, gate);
    for (let distance = 249; distance >= 0; distance--) {
      const offset = townExplorationOffset(layout, { x: gate.x + distance, y: gate.y }, spawn, gate);
      expect(Math.abs(offset.offsetX - previous.offsetX)).toBeLessThan(3);
      expect(Math.abs(offset.offsetY - previous.offsetY)).toBeLessThan(3);
      previous = offset;
    }
  });

  it.each([["gate", [[1472, 536], [1624, 616], [1728, 664]]], ["shop_front_approach", [[1472, 536], [1632, 624]]], ["rear_west_flank", [[1472, 536], [1160, 360]]], ["rear_back_flank", [[1472, 536], [1544, 464], [1616, 432], [1608, 368], [1376, 232]]], ["endcap_west_flank", [[1472, 536], [1544, 464], [1616, 432], [1608, 328], [1632, 304]]], ["endcap_east_flank", [[1472, 536], [1544, 464], [1648, 424], [1712, 424], [1752, 432], [1992, 368]]]] as const)('keeps the named %s route open with over11.99px spare actor clearance', (_name, points) => {
    for (let i = 1; i < points.length; i++) {
      const a = { x: points[i-1]![0], y: points[i-1]![1] }, b = { x: points[i]![0], y: points[i]![1] };
      for (const polygon of solids()) {
        expect(crossesTownFootprint(a, b, 49.999, polygon)).toBe(false);
        expect(crossesTownFootprint(b, a, 49.999, polygon)).toBe(false);
      }
    }
  });

});
