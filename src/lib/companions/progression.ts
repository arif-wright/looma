export type CompanionMilestoneId = 'streak_3' | 'games_5' | 'first_week_active';

export type CompanionMilestoneRule = {
  id: CompanionMilestoneId;
  cosmeticId: string;
  label: string;
  description: string;
  threshold: number;
  kind: 'streak_days' | 'games_played' | 'first_week_days';
};

export const FIRST_ACTIVE_AT_ITEM_KEY = 'companion_progress_first_active_at';
export const FIRST_ACTIVE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const COMPANION_MILESTONE_RULES: CompanionMilestoneRule[] = [
  {
    id: 'streak_3',
    cosmeticId: 'streak-trace-v1',
    label: 'Streak Initiate',
    description: 'Reach a 3-day streak.',
    threshold: 3,
    kind: 'streak_days'
  },
  {
    id: 'games_5',
    cosmeticId: 'arcade-spark-v1',
    label: 'Game Cadet',
    description: 'Play at least 5 games in a session summary.',
    threshold: 5,
    kind: 'games_played'
  },
  {
    id: 'first_week_active',
    cosmeticId: 'week-one-badge-v1',
    label: 'Week One',
    description: 'Stay active through your first week.',
    threshold: 7,
    kind: 'first_week_days'
  }
];

const parseMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
};

const clampCount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const elapsedDays = (fromIso: string, toIso: string) => {
  const fromMs = parseMs(fromIso);
  const toMs = parseMs(toIso);
  if (fromMs === null || toMs === null || toMs < fromMs) return 0;
  return Math.floor((toMs - fromMs) / DAY_MS);
};

export const evaluateCompanionMilestones = (args: {
  nowIso: string;
  firstActiveAtIso: string;
  streakDays: number;
  gamesPlayedCount: number;
  unlockedCosmetics: string[];
}) => {
  const unlockedSet = new Set((args.unlockedCosmetics ?? []).filter((id) => typeof id === 'string' && id.length > 0));
  const streakDays = clampCount(args.streakDays);
  const gamesPlayedCount = clampCount(args.gamesPlayedCount);
  const activeDays = elapsedDays(args.firstActiveAtIso, args.nowIso);

  const earned: CompanionMilestoneRule[] = [];
  for (const rule of COMPANION_MILESTONE_RULES) {
    if (unlockedSet.has(rule.cosmeticId)) continue;
    let hit = false;
    if (rule.kind === 'streak_days') hit = streakDays >= rule.threshold;
    if (rule.kind === 'games_played') hit = gamesPlayedCount >= rule.threshold;
    if (rule.kind === 'first_week_days') hit = activeDays >= rule.threshold;
    if (hit) earned.push(rule);
  }

  return earned;
};

