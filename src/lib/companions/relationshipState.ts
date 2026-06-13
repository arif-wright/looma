export type BondCloseness = 'Distant' | 'Near' | 'Resonant';

export const bondClosenessFromScore = (score: number): BondCloseness => {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  if (normalized >= 70) return 'Resonant';
  if (normalized >= 35) return 'Near';
  return 'Distant';
};

export const bondClosenessSentence = (companionName: string, closeness: BondCloseness) =>
  `Your bond with ${companionName.trim() || 'your companion'} feels ${closeness.toLowerCase()}.`;
