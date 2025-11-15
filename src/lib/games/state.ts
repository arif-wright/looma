import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type Numberish = number | null;

export type RewardEntry = {
  id: string;
  xpDelta: number;
  baseXpDelta?: number | null;
  xpMultiplier?: number | null;
  currencyDelta: number;
  insertedAt: string | null;
  game: string | null;
  gameName: string | null;
  baseCurrencyDelta?: number | null;
  currencyMultiplier?: number | null;
};

export type PlayerProgressState = {
  level: Numberish;
  xp: Numberish;
  xpNext: Numberish;
  energy: Numberish;
  energyMax: Numberish;
  currency: Numberish;
  rewards: RewardEntry[];
  hydrated: boolean;
};

const initialState: PlayerProgressState = {
  level: null,
  xp: null,
  xpNext: null,
  energy: null,
  energyMax: null,
  currency: null,
  rewards: [],
  hydrated: false
};

const store = writable<PlayerProgressState>(initialState);

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeRewards = (rows: unknown): RewardEntry[] => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const payload = row as Record<string, unknown>;
      const id = typeof payload.id === 'string' ? payload.id : null;
      if (!id) return null;

      const session = payload.session && typeof payload.session === 'object' ? (payload.session as Record<string, unknown>) : null;
      const sessionGame = session && session['game'] && typeof session['game'] === 'object'
        ? (session['game'] as Record<string, unknown>)
        : null;

      const insertedAt = typeof payload.insertedAt === 'string'
        ? payload.insertedAt
        : typeof payload.inserted_at === 'string'
          ? payload.inserted_at
          : null;

      const slugRaw = sessionGame ? sessionGame['slug'] : null;
      const nameRaw = sessionGame ? sessionGame['name'] : null;

      const gameSlug = typeof payload.game === 'string'
        ? payload.game
        : typeof slugRaw === 'string'
          ? slugRaw
          : null;

      const gameName = typeof payload.gameName === 'string'
        ? payload.gameName
        : typeof nameRaw === 'string'
          ? nameRaw
          : null;

      return {
        id,
        xpDelta: normalizeNumber(payload.xpDelta ?? payload.xp_delta) ?? 0,
        baseXpDelta: normalizeNumber(payload.baseXpDelta ?? payload.base_xp_delta),
        xpMultiplier: normalizeNumber(payload.xpMultiplier ?? payload.xp_multiplier),
        currencyDelta: normalizeNumber(payload.currencyDelta ?? payload.currency_delta) ?? 0,
        insertedAt,
        game: gameSlug,
        gameName,
        baseCurrencyDelta: normalizeNumber(payload.baseCurrencyDelta ?? payload.base_currency_delta),
        currencyMultiplier: normalizeNumber(payload.currencyMultiplier ?? payload.currency_multiplier)
      } satisfies RewardEntry;
    })
    .filter(Boolean) as RewardEntry[];
};

const mergeState = (updater: (state: PlayerProgressState) => PlayerProgressState) => {
  if (!browser) return; // avoid leaking state across SSR renders
  store.update((current) => updater(current));
};

export const playerProgress = {
  subscribe: store.subscribe
};

export const resetPlayerProgress = () => {
  mergeState(() => ({ ...initialState }));
};

export const applyHeaderStats = (stats: unknown) => {
  if (!browser || !stats || typeof stats !== 'object') return;
  const payload = stats as Record<string, unknown>;
  const level = normalizeNumber(payload.level);
  const xp = normalizeNumber(payload.xp);
  const xpNext = normalizeNumber(payload.xpNext ?? payload.xp_next);
  const energy = normalizeNumber(payload.energy);
  const energyMax = normalizeNumber(payload.energyMax ?? payload.energy_max);

  mergeState((state) => ({
    ...state,
    level: level ?? state.level,
    xp: xp ?? state.xp,
    xpNext: xpNext ?? state.xpNext,
    energy: energy ?? state.energy,
    energyMax: energyMax ?? state.energyMax,
    hydrated: true
  }));
};

export const applyPlayerState = (playerState: unknown) => {
  if (!browser || !playerState || typeof playerState !== 'object') return;
  const payload = playerState as Record<string, unknown>;

  const level = normalizeNumber(payload.level);
  const xp = normalizeNumber(payload.xp);
  const xpNext = normalizeNumber(payload.xpNext ?? payload.xp_next);
  const energy = normalizeNumber(payload.energy);
  const energyMax = normalizeNumber(payload.energyMax ?? payload.energy_max);
  const currency = normalizeNumber(payload.currency);
  const rewards = normalizeRewards(payload.rewards ?? []);

  mergeState((state) => ({
    ...state,
    level: level ?? state.level,
    xp: xp ?? state.xp,
    xpNext: xpNext ?? state.xpNext,
    energy: energy ?? state.energy,
    energyMax: energyMax ?? state.energyMax,
    currency: currency ?? state.currency,
    rewards: rewards.length > 0 ? rewards : state.rewards,
    hydrated: true
  }));
};

export const getPlayerProgressSnapshot = (): PlayerProgressState => {
  let snapshot = initialState;
  store.subscribe((value) => {
    snapshot = value;
  })();
  return snapshot;
};

type RecordRewardArgs = {
  xpDelta: number;
  baseXpDelta?: number | null;
  xpMultiplier?: number | null;
  currencyDelta: number;
  baseCurrencyDelta?: number | null;
  currencyMultiplier?: number | null;
  game?: string | null;
  gameName?: string | null;
  insertedAt?: string | null;
};

export const recordRewardResult = ({
  xpDelta,
  baseXpDelta = null,
  xpMultiplier = null,
  currencyDelta,
  baseCurrencyDelta = null,
  currencyMultiplier = null,
  game = null,
  gameName = null,
  insertedAt = null
}: RecordRewardArgs) => {
  if (!browser) return;
  const safeXp = Number.isFinite(xpDelta) ? Math.max(0, Math.floor(xpDelta)) : 0;
  const safeCurrency = Number.isFinite(currencyDelta) ? Math.max(0, Math.floor(currencyDelta)) : 0;
  const safeBaseCurrency = Number.isFinite(baseCurrencyDelta as number)
    ? Math.max(0, Math.floor(baseCurrencyDelta as number))
    : null;
  const safeMultiplier = Number.isFinite(currencyMultiplier as number)
    ? Number(currencyMultiplier)
    : null;
  const timestamp = insertedAt ?? new Date().toISOString();

  mergeState((state) => {
    const nextXp = typeof state.xp === 'number' ? state.xp + safeXp : safeXp;
    const nextCurrency = typeof state.currency === 'number' ? state.currency + safeCurrency : safeCurrency;

    const rewardEntry: RewardEntry = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      xpDelta: safeXp,
      baseXpDelta: Number.isFinite(baseXpDelta as number) ? Math.round(baseXpDelta as number) : null,
      xpMultiplier: Number.isFinite(xpMultiplier as number) ? Number(xpMultiplier) : null,
      currencyDelta: safeCurrency,
      insertedAt: timestamp,
      game,
      gameName,
      baseCurrencyDelta: safeBaseCurrency,
      currencyMultiplier: safeMultiplier
    };

    const nextRewards = [rewardEntry, ...state.rewards].slice(0, 20);

    return {
      ...state,
      xp: nextXp,
      currency: nextCurrency,
      rewards: nextRewards,
      hydrated: true
    };
  });
};
