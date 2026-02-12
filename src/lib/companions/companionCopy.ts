export const BOND_LEVEL_TOOLTIP =
  'Bond level describes how familiar you and your companion are. Check in whenever you want; bonuses grow over time.';

export const MOOD_TOOLTIP =
  'Mood changes with affection, trust, and energy. Radiant companions boost your progress; tired companions need rest and care.';

export const RITUALS_TOOLTIP =
  'Complete these daily rituals with your companion to earn small rewards and keep your bond growing.';

export const describeBondLevelUpToast = (name: string, level: number) => {
  const safeName = name?.trim().length ? name.trim() : 'Your companion';
  return `${safeName} reached Bond Level ${level}! ✨`;
};
