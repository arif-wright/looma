import { writable } from 'svelte/store';
import type { CompanionRitual } from '$lib/companions/rituals';

const { subscribe, set, update } = writable<CompanionRitual[]>([]);

export const companionRitualsStore = {
  subscribe,
  set: (rituals: CompanionRitual[] | null | undefined) => {
    set(Array.isArray(rituals) ? rituals : []);
  },
  update: (mutator: (list: CompanionRitual[]) => CompanionRitual[]) => {
    update((current) => mutator(current.slice()));
  }
};

export const applyRitualUpdate = (list: CompanionRitual[] | null | undefined) => {
  try {
    companionRitualsStore.set(list ?? []);
  } catch (error) {
    console.warn('companion rituals: skipping update', error);
  }
};
