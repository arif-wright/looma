import { describe, expect, it } from 'vitest';
import { getWorldArea } from '../game/areas';
import { predictAreaMovement, sameArea } from '../game/phaser/presentationState';

describe('illustrated Phaser area presentation', () => {
  it('hides players and residents from another area while preserving legacy Grove snapshots', () => {
    expect(sameArea(undefined, 'wilds-exploration')).toBe(true);
    expect(sameArea(undefined, 'wilds-town')).toBe(false);
    expect(sameArea('wilds-exploration', 'wilds-town')).toBe(false);
    expect(sameArea('wilds-town', 'wilds-town')).toBe(true);
  });
  it('uses each map’s blockers and radius-16 player footprint', () => {
    for (const id of ['wilds-exploration', 'wilds-town']) {
      const area = getWorldArea(id);
      for (const blocker of area.traversal.blockers) {
        const position = { x: blocker.x - blocker.radius - 16, y: blocker.y };
        expect(predictAreaMovement(position, { x: 1, y: 0 }, 16, 220, area.traversal)).toEqual(position);
      }
    }
  });
  it('changes prediction blockers with the selected map', () => {
    const position = { x: 121, y: 95 };
    const direction = { x: 1, y: 0 };
    const hollow = predictAreaMovement(position, direction, 16, 220, getWorldArea('wilds-town').traversal);
    expect(hollow).toEqual(position);
  });
  it('clamps movement to map-local bounds and leaves portal arrival walkable', () => {
    for (const id of ['wilds-exploration', 'wilds-town']) {
      const area = getWorldArea(id);
      expect(predictAreaMovement({ x: 16, y: 16 }, { x: -1, y: -1 }, 100, 220, area.traversal)).toEqual({ x: 16, y: 16 });
      const target = getWorldArea(area.portal.targetMapId);
      const moved = predictAreaMovement(area.portal.arrival, { x: 0, y: 1 }, 16, 220, target.traversal);
      expect(moved.y).toBeGreaterThan(area.portal.arrival.y);
    }
  });
});
