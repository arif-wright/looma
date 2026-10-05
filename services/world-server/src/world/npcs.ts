import type { WorldMapDefinition } from './maps.js';
import type { Position } from './traversal.js';

export type NpcDefinition = {
  id: string; name: string; mapId: WorldMapDefinition['id'];
  kind: 'resident'; playerBody: 'male' | 'female';
  speed: number; pauseMs: number; route: readonly Position[];
};
export const WORLD_NPCS: readonly NpcDefinition[] = [
  { id: 'rowan', name: 'Rowan', mapId: 'wilds-exploration', kind: 'resident', playerBody: 'male', speed: 32, pauseMs: 1_700,
    route: [{ x: 370, y: 270 }, { x: 470, y: 210 }, { x: 560, y: 270 }, { x: 470, y: 326 }] },
  { id: 'wren', name: 'Wren', mapId: 'wilds-town', kind: 'resident', playerBody: 'female', speed: 28, pauseMs: 2_100,
    route: [{ x: 380, y: 310 }, { x: 530, y: 310 }, { x: 610, y: 260 }, { x: 530, y: 214 }, { x: 380, y: 214 }] }
];

// A bounded, deterministic route. No per-resident timer, account, AI or durable state.
export const npcPositionAt = (definition: NpcDefinition, elapsedMs: number) => {
  const durations = definition.route.map((start, index) => {
    const end = definition.route[(index + 1) % definition.route.length]!;
    return Math.hypot(end.x - start.x, end.y - start.y) / definition.speed * 1_000;
  });
  const cycleMs = durations.reduce((sum, duration) => sum + duration + definition.pauseMs, 0);
  let time = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % cycleMs;
  for (let index = 0; index < definition.route.length; index++) {
    const start = definition.route[index]!;
    const end = definition.route[(index + 1) % definition.route.length]!;
    if (time < definition.pauseMs) return { ...start, moving: false };
    time -= definition.pauseMs;
    if (time < durations[index]!) {
      const progress = time / durations[index]!;
      return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, moving: true };
    }
    time -= durations[index]!;
  }
  return { ...definition.route[0]!, moving: false };
};
