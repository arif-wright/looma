import type { Companion, CompanionStats } from '$lib/stores/companions';

export type DerivedMoodKey = 'radiant' | 'calm' | 'quiet' | 'waiting' | 'resting' | 'distant';

export type CompanionEffectiveState = {
  lastCareAt: string | null;
  lastCheckInAt: string | null;
  msSinceCare: number | null;
  msSinceCheckIn: number | null;
  affection: number;
  trust: number;
  energy: number;
  moodKey: DerivedMoodKey;
  moodLabel: string;
};

export type AliveCompanionState = 'steady' | 'quiet' | 'softening';

export type AliveCompanionSnapshot = {
  state: AliveCompanionState;
  reason: string;
  primaryAction: 'check_in' | 'sit' | 'stay';
  lastMeaningfulInteractionAt: string | null;
  repairStartedAt: string | null;
  repairCompletedAt: string | null;
  absenceHours: number | null;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

const parseIso = (iso: string | null | undefined) => {
  if (!iso) return null;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
};

const pickLatestIso = (values: Array<string | null | undefined>) => {
  let latest: string | null = null;
  let latestTs = -Infinity;
  for (const value of values) {
    const ts = parseIso(value);
    if (ts === null) continue;
    if (ts > latestTs) {
      latestTs = ts;
      latest = value ?? null;
    }
  }
  return latest;
};

const computeDecay = (elapsedDays: number) => {
  // Absence changes relational availability, not physical capacity.
  const energy = 0;
  const affection = Math.min(25, Math.max(0, elapsedDays - 2) * 1);
  const trust = 0;
  return { energy, affection, trust };
};

const deriveMood = (energy: number, daysSinceCare: number): DerivedMoodKey => {
  if (energy <= 15) return daysSinceCare > 14 ? 'distant' : 'resting';
  if (daysSinceCare < 1) return energy >= 60 ? 'radiant' : 'calm';
  if (daysSinceCare < 3) return 'calm';
  if (daysSinceCare < 7) return 'quiet';
  if (daysSinceCare < 14) return 'waiting';
  return 'distant';
};

export const moodLabelFor = (key: DerivedMoodKey) => {
  if (key === 'radiant') return 'Radiant';
  if (key === 'calm') return 'Calm';
  if (key === 'quiet') return 'Quiet';
  if (key === 'waiting') return 'Waiting';
  if (key === 'resting') return 'Resting';
  return 'Distant';
};

export const moodDescriptionFor = (key: DerivedMoodKey) => {
  if (key === 'radiant') return 'Radiant · bright and present with you.';
  if (key === 'calm') return 'Calm · settled at your side.';
  if (key === 'quiet') return 'Quiet · staying close, a little reserved.';
  if (key === 'waiting') return 'Waiting · ready when you are.';
  if (key === 'resting') return 'Resting · taking a small pause.';
  return 'Distant · could use a gentle check-in.';
};

export const computeCompanionEffectiveState = (instance: Companion, now: Date = new Date()): CompanionEffectiveState => {
  const stats: CompanionStats | null = instance.stats ?? null;

  const lastCareAt = pickLatestIso([stats?.fed_at, stats?.played_at, stats?.groomed_at]);
  // "Check-in" is any passive tick or care event. We also fall back to `updated_at`
  // so brand new / minimally seeded companions still feel time-consistent across surfaces.
  const lastCheckInAt = pickLatestIso([stats?.last_passive_tick, lastCareAt, instance.updated_at]);

  const nowTs = now.getTime();
  const careTs = parseIso(lastCareAt);
  const checkInTs = parseIso(lastCheckInAt);

  const msSinceCare = careTs === null ? null : Math.max(0, nowTs - careTs);
  const msSinceCheckIn = checkInTs === null ? null : Math.max(0, nowTs - checkInTs);

  const baseAffection = typeof instance.affection === 'number' ? instance.affection : 0;
  const baseTrust = typeof instance.trust === 'number' ? instance.trust : 0;
  const baseEnergy = typeof instance.energy === 'number' ? instance.energy : 0;

  // Gentle decay should reflect time away. If there's no explicit "care" yet, fall back to check-ins
  // (passive ticks / last updated) so we don't show "Radiant" after weeks of inactivity.
  const referenceMs = msSinceCare ?? msSinceCheckIn;
  const elapsedDays = referenceMs === null ? 0 : referenceMs / 86_400_000;
  const decay = referenceMs === null ? { energy: 0, affection: 0, trust: 0 } : computeDecay(elapsedDays);

  const affection = clamp(Math.round(baseAffection - decay.affection));
  const trust = clamp(Math.round(baseTrust - decay.trust));
  const energy = clamp(Math.round(baseEnergy - decay.energy));

  const moodKey = deriveMood(energy, elapsedDays);

  return {
    lastCareAt,
    lastCheckInAt,
    msSinceCare,
    msSinceCheckIn,
    affection,
    trust,
    energy,
    moodKey,
    moodLabel: moodLabelFor(moodKey)
  };
};

export const deriveAliveCompanionState = (
  companionName: string | null | undefined,
  stats: Pick<
    CompanionStats,
    'last_meaningful_interaction_at' | 'repair_started_at' | 'repair_completed_at'
  > | null | undefined,
  now: Date = new Date()
): AliveCompanionSnapshot => {
  const name = companionName?.trim() || 'Your companion';
  const lastMeaningfulInteractionAt = stats?.last_meaningful_interaction_at ?? null;
  const repairStartedAt = stats?.repair_started_at ?? null;
  const repairCompletedAt = stats?.repair_completed_at ?? null;
  const interactionStamp = parseIso(lastMeaningfulInteractionAt);
  const repairStartedStamp = parseIso(repairStartedAt);
  const repairCompletedStamp = parseIso(repairCompletedAt);
  const absenceHours =
    interactionStamp === null ? null : Math.max(0, (now.getTime() - interactionStamp) / 3_600_000);
  const repairActive =
    repairStartedStamp !== null && (repairCompletedStamp === null || repairStartedStamp > repairCompletedStamp);

  if (repairActive) {
    return {
      state: 'softening',
      reason: 'Your presence has changed the shape of this return.',
      primaryAction: 'stay',
      lastMeaningfulInteractionAt,
      repairStartedAt,
      repairCompletedAt,
      absenceHours
    };
  }

  if (absenceHours !== null && absenceHours >= 72) {
    return {
      state: 'quiet',
      reason: `${name} has settled into stillness, but notices that you are here.`,
      primaryAction: 'sit',
      lastMeaningfulInteractionAt,
      repairStartedAt,
      repairCompletedAt,
      absenceHours
    };
  }

  return {
    state: 'steady',
    reason: `${name} feels present and open to you.`,
    primaryAction: 'check_in',
    lastMeaningfulInteractionAt,
    repairStartedAt,
    repairCompletedAt,
    absenceHours
  };
};

export const formatLastCareLabel = (msSinceCare: number | null) => {
  if (msSinceCare === null) return 'No care yet';
  if (msSinceCare < 60_000) return 'Just now';
  if (msSinceCare < 3_600_000) return 'Within the hour';
  if (msSinceCare < 86_400_000) return 'Today';

  const days = Math.floor(msSinceCare / 86_400_000);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 14) return 'Over a week ago';
  if (days < 30) return 'Over two weeks ago';

  const months = Math.floor(days / 30);
  if (months <= 1) return 'Over a month ago';
  return `Over ${months} months ago`;
};
