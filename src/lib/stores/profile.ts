import { writable } from 'svelte/store';

export type CurrentProfile = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
} | null;

export const currentProfile = writable<CurrentProfile>(null);
