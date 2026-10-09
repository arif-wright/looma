import { describe, expect, it } from 'vitest';
import { AREAS, createExpedition, enterRuins, recordKill, collectGold, returnToTown, advanceArea, canAdvance, heroLevel, heroMaxHp, heroDamage } from '../games/arpg/expedition';
const clear = (state: ReturnType<typeof createExpedition>) => Array.from({ length: AREAS[state.area].enemies }).reduce<ReturnType<typeof createExpedition>>((s) => recordKill(s), state);
describe('run-local town and expedition progression', () => {
  it('starts safely in town without enemies, XP or loot', () => {
    const town = createExpedition();
    expect(AREAS[town.area].enemies).toBe(0);
    expect(recordKill(town)).toBe(town);
    expect(collectGold(town)).toBe(town);
    expect(advanceArea(town)).toBe(town);
  });
  it('requires all wardens before descending and does not count excess kills', () => {
    const floor = enterRuins(createExpedition());
    expect(floor.area).toBe(1);
    expect(advanceArea(floor)).toBe(floor);
    const done = clear(floor);
    expect(canAdvance(done)).toBe(true);
    expect(recordKill(done)).toBe(done);
    expect(advanceArea(done).area).toBe(2);
    expect(advanceArea(done).floorKills).toBe(0);
  });
  it('completes both floors, banks gathered loot once, and returns to safety', () => {
    const floor1 = clear(collectGold(enterRuins(createExpedition())));
    const floor2 = clear(collectGold(advanceArea(floor1)));
    const town = advanceArea(floor2);
    expect(town).toMatchObject({ area: 0, kills: 10, xp: 250, bankedGold: 2, carriedGold: 0, cleared: true, returned: true, outcome: 'completed' });
    expect(returnToTown(town)).toBe(town);
    expect(enterRuins(town)).toBe(town);
    expect(advanceArea(town)).toBe(town);
  });
  it('recognizes victory through either return control after the final clear', () => {
    const floor2 = clear(advanceArea(clear(enterRuins(createExpedition()))));
    expect(returnToTown(floor2)).toMatchObject({ outcome: 'completed', cleared: true });
  });
  it('retreat banks loot but does not mark the dungeon completed', () => {
    const town = returnToTown(collectGold(enterRuins(createExpedition())));
    expect(town).toMatchObject({ area: 0, bankedGold: 1, outcome: 'retreated', cleared: false });
  });
  it('rescue loses carried loot while retaining run-local experience', () => {
    const town = returnToTown(recordKill(collectGold(enterRuins(createExpedition()))), true);
    expect(town).toMatchObject({ area: 0, carriedGold: 0, bankedGold: 0, xp: 25, outcome: 'rescued' });
  });
  it('levels the hero at clear thresholds and improves combat stats', () => {
    expect([heroLevel(0), heroLevel(99), heroLevel(100), heroLevel(250)]).toEqual([1, 1, 2, 3]);
    expect(heroMaxHp(100)).toBe(160);
    expect(heroDamage(250)).toBe(44);
  });
  it('new visits reset local progression and cannot share mutations', () => {
    const first = createExpedition();
    clear(enterRuins(first));
    expect(first).toEqual(createExpedition());
  });
});
