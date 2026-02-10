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
  // Gentle, non-punitive drift. Energy moves fastest; trust is slowest.
  const energy = Math.min(60, Math.max(0, elapsedDays - 0.5) * 6);
  const affection = Math.min(25, Math.max(0, elapsedDays - 2) * 1);
  const trust = Math.min(15, Math.max(0, elapsedDays - 7) * 0.5);
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
