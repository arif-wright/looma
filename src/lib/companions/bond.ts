export type BondBonus = {
  level: number;
  xpMultiplier: number;
  missionEnergyBonus: number;
  label: string;
  description: string;
  strong?: boolean;
};

export type BondAchievementDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
  level: number;
};

export type BondAchievementStatus = BondAchievementDefinition & {
  unlocked: boolean;
  unlocked_at: string | null;
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

export const BOND_ACHIEVEMENTS: BondAchievementDefinition[] = [
  {
    key: 'bond_first',
    name: 'First Bond',
    description: 'Reach bond level 1 with any companion.',
    icon: 'heart',
    level: 1
  },
  {
    key: 'bond_growing',
    name: 'Growing Closer',
    description: 'Reach bond level 4 with any companion.',
    icon: 'sparkles',
    level: 4
  },
  {
    key: 'bond_unbreakable',
    name: 'Unbreakable Bond',
    description: 'Reach bond level 8 with any companion.',
    icon: 'infinity',
    level: 8
  }
];

export const BOND_ACHIEVEMENT_KEYS = BOND_ACHIEVEMENTS.map((item) => item.key);

export type BondMilestoneDefinition = {
  level: number;
  action: string;
  emoji: string;
  label: string;
  note: (name: string) => string;
  toast: (name: string) => string;
};

const fallbackName = (name?: string | null) => (name && name.trim().length > 0 ? name.trim() : 'your companion');

export const BOND_MILESTONES: BondMilestoneDefinition[] = [
  {
    level: 2,
    action: 'bond_milestone_minor',
    emoji: '💞',
    label: 'Growing curious',
    note: (rawName: string) => {
      const name = fallbackName(rawName);
      return `You notice ${name} watching you a little more closely.`;
    },
    toast: (rawName: string) => {
      const name = fallbackName(rawName);
      return `${name} reached Bond Level 2. XP bonus nudged up.`;
    }
  },
  {
    level: 5,
    action: 'bond_milestone_major',
    emoji: '🌠',
    label: 'In sync',
    note: (rawName: string) => {
      const name = fallbackName(rawName);
      return `${name} syncs with your rhythm—your bond feels steady.`;
    },
    toast: (rawName: string) => {
      const name = fallbackName(rawName);
      return `${name} reached Bond Level 5. XP bonus grew stronger.`;
    }
  },
  {
    level: 8,
    action: 'bond_milestone_legendary',
    emoji: '💫',
    label: 'Unbreakable',
    note: (rawName: string) => {
      const name = fallbackName(rawName);
      return `Your bond with ${name} feels unbreakable.`;
    },
    toast: (rawName: string) => {
      const name = fallbackName(rawName);
      return `${name} reached Bond Level 8. Your companion power is radiant.`;
    }
  }
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

export const getBondMilestoneTier = (level?: number | null): number => {
  if (!Number.isFinite(level as number)) return 0;
  const safe = Math.max(0, Math.floor(level as number));
  let tier = 0;
  for (const milestone of BOND_MILESTONES) {
    if (safe >= milestone.level) {
      tier += 1;
    }
  }
  return tier;
};

export const milestoneForAction = (action: string) =>
  BOND_MILESTONES.find((entry) => entry.action === action) ?? null;

export const getMissingMilestoneActions = (level: number, recorded: Set<string>): string[] => {
  const safe = Math.max(0, Math.floor(level));
  return BOND_MILESTONES.filter((entry) => safe >= entry.level && !recorded.has(entry.action)).map((entry) => entry.action);
};

export const describeMilestoneNote = (action: string, companionName: string) => {
  const milestone = milestoneForAction(action);
  if (!milestone) return null;
  return milestone.note(companionName);
};

export const describeMilestoneToast = (action: string, companionName: string) => {
  const milestone = milestoneForAction(action);
  if (!milestone) return null;
  return milestone.toast(companionName);
};
