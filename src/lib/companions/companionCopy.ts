export const BOND_LEVEL_TOOLTIP =
  'Bond level reflects your affection, trust, and time spent together. Higher bond means better XP and mission energy bonuses.';

export const MOOD_TOOLTIP =
  'Mood changes with affection, trust, and energy. Radiant companions boost your progress; tired companions need rest and care.';

export const RITUALS_TOOLTIP =
  'Complete these daily rituals with your companion to earn small rewards and keep your bond growing.';

export const describeBondLevelUpToast = (name: string, level: number) => {
  const safeName = name?.trim().length ? name.trim() : 'Your companion';
  return `${safeName} reached Bond Level ${level}! ✨`;
};
