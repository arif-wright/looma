import { writable } from 'svelte/store';

export type CompanionBondEvent = {
  type: string;
  payload?: Record<string, any>;
  timestamp: number;
};

const xpStore = writable(0);
const bondEventStore = writable<CompanionBondEvent[]>([]);

export const companionXP = { subscribe: xpStore.subscribe };
export const companionBondEvents = { subscribe: bondEventStore.subscribe };

export const addCompanionXP = (amount: number) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) return;
  xpStore.update((value) => value + amount);
};

export const addBondEvent = (type: string, payload?: Record<string, any>) => {
  if (!type) return;
  bondEventStore.update((events) => [
    ...events,
    {
      type,
      payload,
      timestamp: Date.now()
    }
  ]);
};
