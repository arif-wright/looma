import { writable } from 'svelte/store';
import { fixture } from './runtime';

// Safety canary: the slice must not introduce a legacy player-state refresh or apply it.
export const applyPlayerState = (value: unknown): never => {
  fixture.playerStates.push(structuredClone(value));
  throw new Error('The Orbfield slice must not apply legacy player-state refresh data.');
};
export const companionRitualsStore = writable<unknown[]>([]);
export const applyRitualUpdate = (value: unknown[]) => {
  fixture.ritualUpdates.push(structuredClone(value));
  companionRitualsStore.set(value);
};
