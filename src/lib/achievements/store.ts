import { writable } from 'svelte/store';

type PanelSource = 'game' | 'profile' | 'notification' | 'toast' | null;

export type AchievementPanelRequest = {
  open: boolean;
  filterSlug: string | null;
  highlightKey: string | null;
  source: PanelSource;
  requestId: number;
};

const initialState: AchievementPanelRequest = {
  open: false,
  filterSlug: null,
  highlightKey: null,
  source: null,
  requestId: 0
};

const panelStore = writable<AchievementPanelRequest>(initialState);

const nextRequestId = () => Date.now();

export const achievementsUI = {
  subscribe: panelStore.subscribe,
  open(options?: { slug?: string | null; highlightKey?: string | null; source?: PanelSource }) {
    panelStore.set({
      open: true,
      filterSlug: options?.slug ?? null,
      highlightKey: options?.highlightKey ?? null,
      source: options?.source ?? null,
      requestId: nextRequestId()
    });
  },
  close() {
    panelStore.update((state) => ({
      ...state,
      open: false,
      highlightKey: null,
      source: null,
      requestId: nextRequestId()
    }));
  },
  focusAchievement(key: string, slug?: string | null, source: PanelSource = null) {
    panelStore.set({
      open: true,
      filterSlug: slug ?? null,
      highlightKey: key,
      source,
      requestId: nextRequestId()
    });
  }
};
