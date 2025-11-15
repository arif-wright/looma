export type CompanionBonusDetails = {
  xpFromCompanion?: number | null;
  companionBonus?: {
    name?: string | null;
    bondLevel?: number | null;
    xpMultiplier?: number | null;
  } | null;
};

export type CompanionBonusDescription = {
  pill: string;
  detail?: string;
};

const formatName = (name?: string | null) => {
  if (name && name.trim().length > 0) {
    return name.trim();
  }
  return 'your companion';
};

const formatMultiplierText = (xpMultiplier?: number | null) => {
  if (!xpMultiplier || !Number.isFinite(xpMultiplier)) return null;
  const pct = Math.round((xpMultiplier - 1) * 100);
  if (pct <= 0) return null;
  return `+${pct}% XP`;
};

export const describeCompanionBonus = (
  details: CompanionBonusDetails | null | undefined
): CompanionBonusDescription | null => {
  const bonus = details?.companionBonus ?? null;
  const level = bonus?.bondLevel ?? 0;
  if (level < 2) return null;

  const xpFromCompanion = Math.max(0, Math.floor(details?.xpFromCompanion ?? 0));
  const name = formatName(bonus?.name);
  const multiplierText = formatMultiplierText(bonus?.xpMultiplier);
  const bondBits = [`Bond Lv ${level}`];
  if (multiplierText) {
    bondBits.push(multiplierText);
  }
  const bondSummary = bondBits.join(' · ');

  if (xpFromCompanion > 0) {
    return {
      pill: `+${xpFromCompanion} XP from ${name} — ${bondSummary}`
    };
  }

  return {
    pill: `${name} (${bondSummary})`,
    detail: 'No extra XP on this short run'
  };
};
