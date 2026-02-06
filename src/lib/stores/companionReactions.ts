import { writable } from 'svelte/store';

export type CompanionReaction = {
  text: string;
  kind?: string;
  ttlMs?: number;
};

export const companionReaction = writable<CompanionReaction | null>(null);

export const pushCompanionReaction = (reaction: CompanionReaction | null) => {
  companionReaction.set(reaction);
};
