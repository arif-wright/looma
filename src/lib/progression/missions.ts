import { writable } from 'svelte/store';

export type MissionProgress = Record<string, number>;

const { subscribe, update } = writable<MissionProgress>({});

export const missionProgress = { subscribe };

export const updateMissionProgress = (key: string, delta: number) => {
  if (!key || typeof delta !== 'number' || !Number.isFinite(delta)) return;
  update((current) => ({
    ...current,
    [key]: (current[key] ?? 0) + delta
  }));
};
