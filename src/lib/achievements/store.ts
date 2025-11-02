import { writable } from 'svelte/store';

type PanelSource = 'game' | 'profile' | 'notification' | 'toast' | null;

export type AchievementPanelRequest = {
  open: boolean;
  filterSlug: string | null;
  filterGameId: string | null;
  highlightKey: string | null;
  source: PanelSource;
  requestId: number;
};

const initialState: AchievementPanelRequest = {
  open: false,
  filterSlug: null,
  filterGameId: null,
  highlightKey: null,
  source: null,
  requestId: 0
};

const panelStore = writable<AchievementPanelRequest>(initialState);

const nextRequestId = () => Date.now();

type OpenOptions = {
  slug?: string | null;
  gameId?: string | null;
  highlightKey?: string | null;
  source?: PanelSource;
};

export const achievementsUI = {
  subscribe: panelStore.subscribe,
  open(options?: OpenOptions) {
    panelStore.set({
      open: true,
      filterSlug: options?.slug ?? null,
      filterGameId: options?.gameId ?? null,
      highlightKey: options?.highlightKey ?? null,
      source: options?.source ?? null,
      requestId: nextRequestId()
    });
  },
  close() {
    panelStore.update((state) => ({
      ...state,
      open: false,
      filterGameId: null,
      highlightKey: null,
      source: null,
      requestId: nextRequestId()
    }));
  },
  focusAchievement(key: string, options?: { slug?: string | null; gameId?: string | null; source?: PanelSource }) {
    panelStore.set({
      open: true,
      filterSlug: options?.slug ?? null,
      filterGameId: options?.gameId ?? null,
      highlightKey: key,
      source: options?.source ?? null,
      requestId: nextRequestId()
    });
  }
};
