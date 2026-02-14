import type { HomeMood } from '$lib/components/home/homeLoopTypes';

export type FieldMode = 'neutral' | 'support' | 'settle' | 'explore' | 'activate' | 'recover';

export type PrimaryAction = 'CHECK_IN' | 'RECONNECT_30' | 'SEND_WARMTH' | 'QUICK_SPARK' | 'MICRO_RITUAL';

export type HomeState = {
  moodToday: HomeMood | null;
  companionStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady';
  companionEnergy: number;
  unreadWhispers: number;
  quickMissionAvailable: boolean;
  energyOk: boolean;
};

export type ConstellationId = 'signals' | 'missions' | 'companion' | 'games' | 'ritual';

export type ConstellationConfig = {
  id: ConstellationId;
  label: string;
  description: string;
  icon: 'warmth' | 'spark' | 'companion' | 'ritual' | 'mission';
  href: string;
  relevance: number;
  x: number;
  y: number;
};

export type FieldConfig = {
  fieldMode: FieldMode;
  primaryAction: PrimaryAction;
  constellations: ConstellationConfig[];
  layoutPositions: {
    orb: { x: number; y: number };
    halo: { x: number; y: number };
  };
};

const MODE_BY_MOOD: Record<HomeMood, FieldMode> = {
  heavy: 'support',
  calm: 'settle',
  curious: 'explore',
  energized: 'activate',
  numb: 'recover'
};

const BASE_ANGLES: Record<ConstellationId, number> = {
  signals: -62,
  missions: -10,
  companion: 46,
  games: 132,
  ritual: 206
};

const BASE_LABELS: Record<ConstellationId, string> = {
  signals: 'Send warmth',
  missions: 'Quick spark',
  companion: 'Visit companion',
  games: 'Play now',
  ritual: 'Micro ritual'
};

const BASE_DESCRIPTIONS: Record<ConstellationId, string> = {
  signals: 'Reply to your circle',
  missions: 'Short action burst',
  companion: 'Check your bond',
  games: 'Fast momentum loop',
  ritual: '20-second reset'
};

const BASE_ICONS: Record<ConstellationId, ConstellationConfig['icon']> = {
  signals: 'warmth',
  missions: 'mission',
  companion: 'companion',
  games: 'spark',
  ritual: 'ritual'
};

const BASE_HREFS: Record<ConstellationId, string> = {
  signals: '/app/circles',
  missions: '/app/games',
  companion: '/app/companions',
  games: '/app/games',
  ritual: '/app/companions'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const stableOffset = (id: ConstellationId) => {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return (sum % 9) - 4;
};

const choosePrimaryAction = (state: HomeState): PrimaryAction => {
  if (!state.moodToday) return 'CHECK_IN';
  if (state.companionStatus === 'Distant' || state.companionEnergy < 32) return 'RECONNECT_30';
  if (state.unreadWhispers > 0) return 'SEND_WARMTH';
  if (state.quickMissionAvailable && state.energyOk) return 'QUICK_SPARK';
  return 'MICRO_RITUAL';
};

const relevanceByAction = (action: PrimaryAction, id: ConstellationId, state: HomeState) => {
  const base =
    id === 'companion' ? 0.64 : id === 'signals' ? 0.58 : id === 'missions' ? 0.56 : id === 'games' ? 0.52 : 0.48;

  let boost = 0;
  if (action === 'CHECK_IN' && id === 'ritual') boost += 0.24;
  if (action === 'RECONNECT_30' && id === 'companion') boost += 0.36;
  if (action === 'SEND_WARMTH' && id === 'signals') boost += 0.34;
  if (action === 'QUICK_SPARK' && (id === 'missions' || id === 'games')) boost += 0.28;
  if (action === 'MICRO_RITUAL' && id === 'ritual') boost += 0.3;

  if (state.companionStatus === 'Distant' && id === 'companion') boost += 0.12;
  if (state.unreadWhispers > 0 && id === 'signals') boost += 0.1;

  return clamp(base + boost, 0.24, 1);
};

export const buildFieldConfig = (state: HomeState): FieldConfig => {
  const primaryAction = choosePrimaryAction(state);
  const fieldMode = state.moodToday ? MODE_BY_MOOD[state.moodToday] : 'neutral';

  const modeBoost = (id: ConstellationId) => {
    if (fieldMode === 'support' && (id === 'companion' || id === 'signals')) return 0.14;
    if (fieldMode === 'activate' && (id === 'games' || id === 'missions')) return 0.14;
    if (fieldMode === 'explore' && id === 'missions') return 0.12;
    if (fieldMode === 'recover' && (id === 'ritual' || id === 'companion')) return 0.12;
    if (fieldMode === 'settle' && (id === 'ritual' || id === 'companion')) return 0.1;
    return 0;
  };

  const constellations = (Object.keys(BASE_ANGLES) as ConstellationId[]).map((id) => {
    const relevance = clamp(relevanceByAction(primaryAction, id, state) + modeBoost(id), 0.24, 1);
    const inward = relevance * 16;
    const radius = 43 - inward;
    const angle = BASE_ANGLES[id] + stableOffset(id);
    const rad = (angle * Math.PI) / 180;

    return {
      id,
      label: BASE_LABELS[id],
      description: BASE_DESCRIPTIONS[id],
      icon: BASE_ICONS[id],
      href: BASE_HREFS[id],
      relevance,
      x: 50 + Math.cos(rad) * radius,
      y: 47 + Math.sin(rad) * radius
    } satisfies ConstellationConfig;
  });

  return {
    fieldMode,
    primaryAction,
    constellations,
    layoutPositions: {
      orb: { x: 50, y: 44 },
      halo: { x: 50, y: 83 }
    }
  };
};
