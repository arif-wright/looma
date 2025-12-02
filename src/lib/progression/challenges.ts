import { writable } from 'svelte/store';

export type ChallengeProgress = Record<string, number>;

const createProgressStore = () => {
  const { subscribe, update } = writable<ChallengeProgress>({});
  const increment = (key: string, delta: number) => {
    if (!key || typeof delta !== 'number' || !Number.isFinite(delta)) return;
    update((current) => ({
      ...current,
      [key]: (current[key] ?? 0) + delta
    }));
  };
  return { subscribe, increment };
};

const dailyStore = createProgressStore();
const weeklyStore = createProgressStore();

export const dailyChallenges = { subscribe: dailyStore.subscribe };
export const weeklyChallenges = { subscribe: weeklyStore.subscribe };

export const updateDailyChallenge = (key: string, delta: number) => {
  dailyStore.increment(key, delta);
};

export const updateWeeklyChallenge = (key: string, delta: number) => {
  weeklyStore.increment(key, delta);
};
