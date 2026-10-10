/** Run-local gameplay only. These values never grant account XP, items, or currency. */
export const AREAS = [
  { id: 'lantern-square', name: 'Lantern Square', subtitle: 'A safe place to prepare and return.', tint: 0xe8cda0, enemies: 0 },
  { id: 'mossgate', name: 'Mossgate Ruins', subtitle: 'Floor 1 · Clear the wardens to open the stair.', tint: 0x9dbb9b, enemies: 4 },
  { id: 'ember-vault', name: 'Ember Vault', subtitle: 'Floor 2 · Break the last watch and return home.', tint: 0xc49784, enemies: 6 }
] as const;
export type AreaIndex = 0 | 1 | 2;
export type Expedition = {
  area: AreaIndex;
  xp: number;
  kills: number;
  floorKills: number;
  carriedGold: number;
  bankedGold: number;
  cleared: boolean;
  returned: boolean;
  outcome: 'preparing' | 'exploring' | 'retreated' | 'rescued' | 'completed';
};
export const createExpedition = (): Expedition => ({ area: 0, xp: 0, kills: 0, floorKills: 0, carriedGold: 0, bankedGold: 0, cleared: false, returned: false, outcome: 'preparing' });
export const heroLevel = (xp: number) => 1 + Math.floor(Math.max(0, xp) / 100);
export const heroMaxHp = (xp: number) => 140 + (heroLevel(xp) - 1) * 20;
export const heroDamage = (xp: number) => 32 + (heroLevel(xp) - 1) * 6;
export const canAdvance = (state: Expedition) => state.area > 0 && state.floorKills >= AREAS[state.area].enemies;
export function enterRuins(state: Expedition): Expedition {
  if (state.area !== 0 || state.returned) return state;
  return { ...state, area: 1, floorKills: 0, outcome: 'exploring' };
}
export function recordKill(state: Expedition): Expedition {
  if (state.area === 0 || canAdvance(state)) return state;
  return { ...state, kills: state.kills + 1, floorKills: state.floorKills + 1, xp: state.xp + 25 };
}
export function collectGold(state: Expedition): Expedition {
  return state.area === 0 ? state : { ...state, carriedGold: state.carriedGold + 1 };
}
export function returnToTown(state: Expedition, rescued = false): Expedition {
  if (state.area === 0) return state;
  const cleared = state.cleared || (state.area === 2 && canAdvance(state));
  return { ...state, cleared, area: 0, floorKills: 0, bankedGold: state.bankedGold + (rescued ? 0 : state.carriedGold), carriedGold: 0, returned: true,
    outcome: rescued ? 'rescued' : cleared ? 'completed' : 'retreated' };
}
export function advanceArea(state: Expedition): Expedition {
  if (!canAdvance(state)) return state;
  if (state.area === 1) return { ...state, area: 2, floorKills: 0 };
  return returnToTown({ ...state, cleared: true });
}
