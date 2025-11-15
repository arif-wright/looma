export type BondBonus = {
  level: number;
  xpMultiplier: number;
  missionEnergyBonus: number;
  label: string;
  description: string;
  strong?: boolean;
};

type BondBonusTier = {
  minLevel: number;
  xpMultiplier: number;
  missionEnergyBonus: number;
  label: string;
  description: string;
  strong?: boolean;
};

const BASE_TIER: BondBonus = {
  level: 0,
  xpMultiplier: 1,
  missionEnergyBonus: 0,
  label: 'Warming up',
  description: 'Spend time together to unlock boosts.'
};

const BOND_BONUS_TABLE: BondBonusTier[] = [
  { minLevel: 8, xpMultiplier: 1.1, missionEnergyBonus: 5, label: 'Strong bond', description: '+10% XP, +5 mission energy cap', strong: true },
  { minLevel: 6, xpMultiplier: 1.08, missionEnergyBonus: 3, label: 'Attuned stride', description: '+8% XP, +3 mission energy' },
  { minLevel: 4, xpMultiplier: 1.05, missionEnergyBonus: 2, label: 'In sync', description: '+5% XP, +2 mission energy' },
  { minLevel: 2, xpMultiplier: 1.02, missionEnergyBonus: 0, label: 'Tiny boost', description: '+2% XP on completions' },
  { minLevel: 0, xpMultiplier: 1, missionEnergyBonus: 0, label: 'Warming up', description: 'No bond bonuses yet.' }
];

const clampScore = (score: number) => Math.max(0, Math.min(200, Math.round(score)));

export const scoreToBondLevel = (score: number): number => {
  const safe = clampScore(score);
  if (safe >= 180) return 10;
  if (safe >= 160) return 9;
  if (safe >= 140) return 8;
  if (safe >= 120) return 7;
  if (safe >= 100) return 6;
  if (safe >= 80) return 5;
  if (safe >= 60) return 4;
  if (safe >= 40) return 3;
  if (safe >= 20) return 2;
  if (safe >= 10) return 1;
  return 0;
};

export const calculateBondScore = (affection: number, trust: number, careCount: number): number => {
  const baseAffection = Number.isFinite(affection) ? Math.max(0, Math.floor(affection)) : 0;
  const baseTrust = Number.isFinite(trust) ? Math.max(0, Math.floor(trust)) : 0;
  const careBonus = Number.isFinite(careCount) ? Math.min(Math.max(Math.floor(careCount / 5), 0), 20) : 0;
  return clampScore(baseAffection + baseTrust + careBonus);
};

export const getBondBonusForLevel = (level?: number | null): BondBonus => {
  if (!Number.isFinite(level as number)) return BASE_TIER;
  const safeLevel = Math.max(0, Math.floor(level as number));
  const tier = BOND_BONUS_TABLE.find((entry) => safeLevel >= entry.minLevel);
  if (!tier) {
    return BASE_TIER;
  }
  return {
    level: safeLevel,
    xpMultiplier: tier.xpMultiplier,
    missionEnergyBonus: tier.missionEnergyBonus,
    label: tier.label,
    description: tier.description,
    strong: tier.strong
  };
};

export const formatBonusSummary = (bonus: BondBonus): string => {
  const xpPct = Math.round((bonus.xpMultiplier - 1) * 100);
  const parts: string[] = [];
  if (xpPct > 0) {
    parts.push(`+${xpPct}% XP`);
  }
  if (bonus.missionEnergyBonus > 0) {
    parts.push(`+${bonus.missionEnergyBonus} mission energy`);
  }
  return parts.length ? parts.join(', ') : 'No active bonuses';
};
