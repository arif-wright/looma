export type MuseEvolutionStageKey = 'whisperlight' | 'harmonae' | 'mirae';

export type MuseEvolutionStage = {
  key: MuseEvolutionStageKey;
  label: string;
  badge: string;
};

export type MuseEvolutionRule = {
  stage: MuseEvolutionStage;
  cosmeticId: string;
  streakThreshold: number;
  gamesThreshold: number;
};

export type MuseEvolutionThresholdOverrides = Partial<
  Record<MuseEvolutionStageKey, { streakThreshold?: number; gamesThreshold?: number }>
>;

const MUSE_ID = 'muse';

const STAGE_WHISPERLIGHT: MuseEvolutionStage = {
  key: 'whisperlight',
  label: 'Whisperlight',
  badge: 'Stage I'
};

const STAGE_HARMONAE: MuseEvolutionStage = {
  key: 'harmonae',
  label: 'Harmonae',
  badge: 'Stage II'
};

const STAGE_MIRAE: MuseEvolutionStage = {
  key: 'mirae',
  label: 'Mirae',
  badge: 'Stage III'
};

export const MUSE_EVOLUTION_RULES: MuseEvolutionRule[] = [
  {
    stage: STAGE_HARMONAE,
    cosmeticId: 'muse-stage-harmonae-v1',
    streakThreshold: 3,
    gamesThreshold: 5
  },
  {
    stage: STAGE_MIRAE,
    cosmeticId: 'muse-stage-mirae-v1',
    streakThreshold: 7,
    gamesThreshold: 12
  }
];

export const getMuseEvolutionRules = (
  overrides: MuseEvolutionThresholdOverrides = {}
): MuseEvolutionRule[] =>
  MUSE_EVOLUTION_RULES.map((rule) => {
    const override = overrides[rule.stage.key];
    const streakThreshold =
      typeof override?.streakThreshold === 'number' && Number.isFinite(override.streakThreshold)
        ? Math.max(1, Math.floor(override.streakThreshold))
        : rule.streakThreshold;
    const gamesThreshold =
      typeof override?.gamesThreshold === 'number' && Number.isFinite(override.gamesThreshold)
        ? Math.max(1, Math.floor(override.gamesThreshold))
        : rule.gamesThreshold;
    return {
      ...rule,
      streakThreshold,
      gamesThreshold
    };
  });

const normalizeId = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const hasRuleUnlock = (unlockedCosmetics: string[], cosmeticId: string) => {
  return unlockedCosmetics.some((token) => token === cosmeticId);
};

export const isMuseCompanion = (companionId: string | null | undefined) => normalizeId(companionId) === MUSE_ID;

export const evaluateMuseEvolutionUnlocks = (args: {
  companionId: string;
  streakDays: number;
  gamesPlayedCount: number;
  unlockedCosmetics: string[];
  rules?: MuseEvolutionRule[];
}): MuseEvolutionRule[] => {
  if (!isMuseCompanion(args.companionId)) return [];

  const streakDays = Number.isFinite(args.streakDays) ? Math.max(0, Math.floor(args.streakDays)) : 0;
  const gamesPlayedCount = Number.isFinite(args.gamesPlayedCount) ? Math.max(0, Math.floor(args.gamesPlayedCount)) : 0;
  const unlockedCosmetics = Array.isArray(args.unlockedCosmetics) ? args.unlockedCosmetics : [];

  const rules = Array.isArray(args.rules) && args.rules.length > 0 ? args.rules : MUSE_EVOLUTION_RULES;
  const earned: MuseEvolutionRule[] = [];
  for (const rule of rules) {
    if (hasRuleUnlock(unlockedCosmetics, rule.cosmeticId)) continue;
    const meetsThreshold = streakDays >= rule.streakThreshold || gamesPlayedCount >= rule.gamesThreshold;
    if (meetsThreshold) earned.push(rule);
  }
  return earned;
};

export const resolveMuseEvolutionStage = (args: {
  companionId: string | null | undefined;
  unlockedCosmetics: string[] | null | undefined;
}): MuseEvolutionStage => {
  if (!isMuseCompanion(args.companionId)) return STAGE_WHISPERLIGHT;
  const unlocked = Array.isArray(args.unlockedCosmetics) ? args.unlockedCosmetics : [];

  if (hasRuleUnlock(unlocked, 'muse-stage-mirae-v1')) return STAGE_MIRAE;
  if (hasRuleUnlock(unlocked, 'muse-stage-harmonae-v1')) return STAGE_HARMONAE;
  return STAGE_WHISPERLIGHT;
};
