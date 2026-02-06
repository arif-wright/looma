import { writable } from 'svelte/store';
import type { PortableState } from '$lib/types/portableState';

export type CompanionPrefs = {
  visible: boolean;
  motion: boolean;
  transparent: boolean;
  reactionsEnabled: boolean;
};

const defaults: CompanionPrefs = {
  visible: true,
  motion: true,
  transparent: true,
  reactionsEnabled: true
};

const resolvePortableBool = (items: PortableState['items'], key: string, fallback: boolean) => {
  const match = items.find((entry) => entry.key === key);
  if (!match) return fallback;
  return typeof match.value === 'boolean' ? match.value : fallback;
};

export const companionPrefs = writable<CompanionPrefs>({ ...defaults });

export const hydrateCompanionPrefs = (payload: {
  portableState?: PortableState | null;
  consent?: { reactions?: boolean } | null;
}) => {
  const items = payload?.portableState?.items ?? [];
  const reactions = payload?.consent?.reactions;
  companionPrefs.set({
    visible: resolvePortableBool(items, 'companion_visibility', true),
    motion: resolvePortableBool(items, 'companion_motion', true),
    transparent: resolvePortableBool(items, 'companion_transparency', true),
    reactionsEnabled: typeof reactions === 'boolean' ? reactions : true
  });
};

export const updateCompanionPrefs = (patch: Partial<CompanionPrefs>) => {
  companionPrefs.update((current) => {
    const next = { ...current };
    (Object.keys(patch) as Array<keyof CompanionPrefs>).forEach((key) => {
      const value = patch[key];
      if (typeof value !== 'undefined') {
        next[key] = value as CompanionPrefs[keyof CompanionPrefs];
      }
    });
    return next;
  });
};
