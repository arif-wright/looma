export const computeEffectiveEnergyMax = (
  baseMax: number | null | undefined,
  bonus: number | null | undefined
): number => {
  const safeBase = typeof baseMax === 'number' && Number.isFinite(baseMax) ? baseMax : 0;
  const safeBonus = typeof bonus === 'number' && Number.isFinite(bonus) ? bonus : 0;
  return Math.max(0, safeBase + safeBonus);
};
