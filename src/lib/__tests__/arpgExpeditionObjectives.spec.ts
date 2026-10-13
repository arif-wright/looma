import { describe, expect, it } from 'vitest';
import { describeExpeditionObjective, type ExpeditionProgress } from '../games/arpg/expeditionObjectives';

describe('read-only expedition objective presentation', () => {
  it('does not invent a current objective without a scene observation', () => {
    expect(describeExpeditionObjective(null)).toBeNull();
  });
  it.each([
    { area: -1, floorKills: 0, outcome: 'exploring' },
    { area: 3, floorKills: 0, outcome: 'exploring' },
    { area: 1, floorKills: -1, outcome: 'exploring' },
    { area: 1, floorKills: 0.5, outcome: 'exploring' },
    { area: 1, floorKills: 5, outcome: 'exploring' },
    { area: 2, floorKills: 7, outcome: 'exploring' },
    { area: 0, floorKills: 1, outcome: 'preparing' },
    { area: 0, floorKills: 0, outcome: 'exploring' },
    { area: 0, floorKills: 0, outcome: 'toString' },
    { area: 1, floorKills: 0, outcome: 'completed' }
  ])('keeps inconsistent observations unknown: %j', (progress) => {
    expect(describeExpeditionObjective(progress as ExpeditionProgress)).toBeNull();
  });
  it('presents a safe town objective without reward or memory claims', () => {
    const result = describeExpeditionObjective({ area: 0, floorKills: 0, outcome: 'preparing' });
    expect(result).toMatchObject({ title: 'Prepare in town', detail: 'Enter the ruins when you’re ready.', wardens: null });
  });
  it.each([[1, 2, 4, 2], [2, 5, 6, 1]] as const)('uses actual floor %s counts and meaningful remaining wardens', (area, defeated, total, remaining) => {
    expect(describeExpeditionObjective({ area, floorKills: defeated, outcome: 'exploring' })?.wardens)
      .toEqual({ defeated, total, remaining });
  });
  it.each([[1, 4, 'Stair open. Choose Descend or press E at the stair.'], [2, 6, 'Way home open. Return to town.']] as const)
    ('shows the available next action only after clearing floor %s', (area, floorKills, detail) => {
      const result = describeExpeditionObjective({ area, floorKills, outcome: 'exploring' });
      expect(result?.detail).toBe(detail); expect(result?.wardens?.remaining).toBe(0);
    });
  it.each([
    ['retreated', 'You returned to town before clearing both floors.'],
    ['rescued', 'You were rescued back to town.'],
    ['completed', 'You cleared both floors and returned to town.']
  ] as const)('reports a local %s outcome without claiming saved rewards', (outcome, detail) => {
    const result = describeExpeditionObjective({ area: 0, floorKills: 0, outcome });
    expect(result).toMatchObject({ title: 'Expedition ended', detail, wardens: null });
    expect(JSON.stringify(result)).not.toMatch(/saved|banked|remembered|reward|quest complete/i);
  });
  it('keeps live announcements stable as counts change and never mutates source state', () => {
    const progress = Object.freeze({ area: 1 as const, floorKills: 1, outcome: 'exploring' as const });
    const first = describeExpeditionObjective(progress)!;
    const second = describeExpeditionObjective({ ...progress, floorKills: 2 })!;
    expect(first.announcement).toBe(second.announcement);
    expect(progress.floorKills).toBe(1);
    expect(Object.isFrozen(first)).toBe(true); expect(Object.isFrozen(first.wardens)).toBe(true);
  });
});
