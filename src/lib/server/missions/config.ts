import type { MissionCost, MissionDefinition, MissionRequirements, MissionType } from './types';

const isMissionType = (value: unknown): value is MissionType =>
  value === 'identity' || value === 'action' || value === 'world';

const asNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const parseTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

const parseCost = (value: unknown): MissionCost | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const energy = asNumberOrNull((value as Record<string, unknown>).energy);
  return energy === null ? {} : { energy };
};

const parseRequirements = (value: unknown): MissionRequirements | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const minLevel = asNumberOrNull((value as Record<string, unknown>).minLevel);
  const minEnergy = asNumberOrNull((value as Record<string, unknown>).minEnergy);
  const minDurationMs = asNumberOrNull((value as Record<string, unknown>).minDurationMs);
  const repeatableRaw = (value as Record<string, unknown>).repeatable;
  const repeatable = typeof repeatableRaw === 'boolean' ? repeatableRaw : null;
  const next: MissionRequirements = {};
  if (minLevel !== null) next.minLevel = minLevel;
  if (minEnergy !== null) next.minEnergy = minEnergy;
  if (repeatable !== null) next.repeatable = repeatable;
  if (minDurationMs !== null) next.minDurationMs = minDurationMs;
  return Object.keys(next).length ? next : {};
};

export const parseMissionDefinition = (row: Record<string, unknown>): MissionDefinition | null => {
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return null;

  const type = isMissionType(row.type) ? row.type : 'action';
  const privacyTags = Array.isArray(row.privacy_tags)
    ? row.privacy_tags.filter((entry): entry is string => typeof entry === 'string')
    : null;
  const tags = parseTags(row.tags);
  const weightRaw = asNumberOrNull(row.weight);
  const weight = weightRaw === null ? 1 : Math.max(1, Math.floor(weightRaw));
  const requirements = parseRequirements(row.requirements);
  const minLevelFromRequirements =
    requirements && typeof requirements.minLevel === 'number' ? requirements.minLevel : null;
  const minLevelFromColumn = asNumberOrNull(row.min_level);
  const minLevel = minLevelFromColumn ?? minLevelFromRequirements;
  const cooldownMsRaw = asNumberOrNull(row.cooldown_ms);

  return {
    id,
    owner_id: typeof row.owner_id === 'string' ? row.owner_id : null,
    title: typeof row.title === 'string' ? row.title : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
    status: typeof row.status === 'string' ? row.status : null,
    energy_reward: asNumberOrNull(row.energy_reward),
    xp_reward: asNumberOrNull(row.xp_reward),
    type,
    cost: parseCost(row.cost),
    requirements,
    requires:
      row.requires && typeof row.requires === 'object' && !Array.isArray(row.requires)
        ? (row.requires as Record<string, unknown>)
        : row.requirements && typeof row.requirements === 'object' && !Array.isArray(row.requirements)
          ? (row.requirements as Record<string, unknown>)
          : null,
    min_level: minLevel,
    minLevel,
    tags,
    weight,
    cooldown_ms: cooldownMsRaw,
    cooldownMs: cooldownMsRaw,
    privacy_tags: privacyTags
  };
};
