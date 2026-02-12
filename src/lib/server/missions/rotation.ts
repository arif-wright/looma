import type { MissionType } from '$lib/server/missions/types';

export type MissionPoolEntry = {
  id: string;
  type?: MissionType | null;
  tags?: string[] | null;
  weight?: number | null;
  minLevel?: number | null;
  min_level?: number | null;
  requires?: Record<string, unknown> | null;
  requirements?: Record<string, unknown> | null;
  cooldownMs?: number | null;
  cooldown_ms?: number | null;
};

type RotationPickOptions = {
  limit: number;
  requiredTags?: string[];
  excludedTags?: string[];
  userLevel?: number;
  includeIdentityForEnergyDaily?: boolean;
  seed: string;
};

const normalizeTags = (tags: string[] | null | undefined) =>
  (tags ?? []).map((tag) => tag.toLowerCase().trim()).filter((tag) => tag.length > 0);

const hasAllTags = (candidateTags: string[], required: string[]) => required.every((tag) => candidateTags.includes(tag));

const hasAnyTags = (candidateTags: string[], excluded: string[]) => excluded.some((tag) => candidateTags.includes(tag));

const readMinLevel = (entry: MissionPoolEntry) => {
  if (typeof entry.minLevel === 'number' && Number.isFinite(entry.minLevel)) return entry.minLevel;
  if (typeof entry.min_level === 'number' && Number.isFinite(entry.min_level)) return entry.min_level;
  const requirements = (entry.requires ?? entry.requirements ?? null) as Record<string, unknown> | null;
  const minLevelReq = requirements?.minLevel;
  return typeof minLevelReq === 'number' && Number.isFinite(minLevelReq) ? minLevelReq : null;
};

const readWeight = (entry: MissionPoolEntry) => {
  const value = entry.weight;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
};

const hash32 = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const lcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export const pickRotatedMissionPool = <T extends MissionPoolEntry>(
  pool: T[],
  options: RotationPickOptions
): T[] => {
  const required = normalizeTags(options.requiredTags ?? []);
  const excluded = normalizeTags(options.excludedTags ?? []);
  const level = typeof options.userLevel === 'number' && Number.isFinite(options.userLevel) ? options.userLevel : 0;

  const filtered = pool.filter((entry) => {
    const tags = normalizeTags(entry.tags);
    if (required.length > 0 && !hasAllTags(tags, required)) return false;
    if (excluded.length > 0 && hasAnyTags(tags, excluded)) return false;

    const minLevel = readMinLevel(entry);
    if (typeof minLevel === 'number' && level < minLevel) return false;

    const isEnergyDaily = tags.includes('daily') && tags.includes('energy');
    const allowsIdentityEnergyDaily = tags.includes('allow_identity_energy_daily');
    if (
      isEnergyDaily &&
      entry.type === 'identity' &&
      !options.includeIdentityForEnergyDaily &&
      !allowsIdentityEnergyDaily
    ) {
      return false;
    }

    return true;
  });

  if (filtered.length <= options.limit) return filtered;

  const rng = lcg(hash32(options.seed));
  const remaining = [...filtered];
  const picks: T[] = [];

  while (remaining.length > 0 && picks.length < options.limit) {
    let totalWeight = 0;
    for (const entry of remaining) totalWeight += readWeight(entry);

    const roll = rng() * totalWeight;
    let cursor = 0;
    let index = 0;

    for (let i = 0; i < remaining.length; i += 1) {
      const current = remaining[i];
      if (!current) continue;
      cursor += readWeight(current);
      if (roll <= cursor) {
        index = i;
        break;
      }
    }

    const [picked] = remaining.splice(index, 1);
    if (picked) picks.push(picked);
  }

  return picks;
};
