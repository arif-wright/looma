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

type RotatingSetOptions = {
  limit: number;
  requiredTags?: string[];
  excludedTags?: string[];
  userLevel?: number;
  includeIdentityForEnergyDaily?: boolean;
  globalSeed?: string;
  scopeKey?: string;
  avoidBackToBack?: boolean;
  repeatAvoidanceWindow?: number;
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

const buildSeed = (seed: string, options?: { globalSeed?: string; scopeKey?: string }) => {
  const parts = [seed.trim()];
  if (options?.globalSeed && options.globalSeed.trim().length > 0) parts.push(options.globalSeed.trim());
  if (options?.scopeKey && options.scopeKey.trim().length > 0) parts.push(options.scopeKey.trim());
  return parts.join(':');
};

const normalizeSeedParts = (seed: string) => seed.split(':').map((part) => part.trim()).filter((part) => part.length > 0);

const previousDaySeed = (dateSeed: string) => {
  const parsed = Date.parse(dateSeed);
  if (Number.isFinite(parsed)) {
    return new Date(parsed - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const parts = normalizeSeedParts(dateSeed);
  if (parts.length === 0) return `${dateSeed}:prev`;
  const tail = parts[parts.length - 1] ?? '';
  const n = Number.parseInt(tail, 10);
  if (Number.isFinite(n)) {
    parts[parts.length - 1] = String(n - 1);
    return parts.join(':');
  }
  return `${dateSeed}:prev`;
};

const previousWeekSeed = (weekSeed: string) => {
  const parsed = Date.parse(weekSeed);
  if (Number.isFinite(parsed)) {
    return new Date(parsed - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const parts = normalizeSeedParts(weekSeed);
  if (parts.length === 0) return `${weekSeed}:prev`;
  const tail = parts[parts.length - 1] ?? '';
  const n = Number.parseInt(tail, 10);
  if (Number.isFinite(n)) {
    parts[parts.length - 1] = String(n - 1);
    return parts.join(':');
  }
  return `${weekSeed}:prev`;
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

const pickWithOptionalRepeatAvoidance = <T extends MissionPoolEntry>(
  pool: T[],
  seed: string,
  previousSeeds: string[],
  options: RotatingSetOptions
) => {
  const pickOptions = {
    limit: options.limit,
    ...(options.requiredTags ? { requiredTags: options.requiredTags } : {}),
    ...(options.excludedTags ? { excludedTags: options.excludedTags } : {}),
    ...(typeof options.userLevel === 'number' ? { userLevel: options.userLevel } : {}),
    ...(typeof options.includeIdentityForEnergyDaily === 'boolean'
      ? { includeIdentityForEnergyDaily: options.includeIdentityForEnergyDaily }
      : {})
  };

  const primary = pickRotatedMissionPool(pool, {
    ...pickOptions,
    seed
  });

  const repeatWindow = Math.max(
    0,
    Math.floor(
      typeof options.repeatAvoidanceWindow === 'number'
        ? options.repeatAvoidanceWindow
        : options.avoidBackToBack === false
          ? 0
          : 1
    )
  );
  if (repeatWindow === 0) return primary;

  const previousIds = new Set<string>();
  for (let i = 0; i < Math.min(repeatWindow, previousSeeds.length); i += 1) {
    const previousSeed = previousSeeds[i];
    if (!previousSeed) continue;
    const previous = pickRotatedMissionPool(pool, {
      ...pickOptions,
      seed: previousSeed
    });
    for (const previousEntry of previous) previousIds.add(previousEntry.id);
  }

  const nonRepeatedPool = pool.filter((entry) => !previousIds.has(entry.id));
  if (nonRepeatedPool.length < options.limit) return primary;

  return pickRotatedMissionPool(nonRepeatedPool, {
    ...pickOptions,
    seed
  });
};

export const getDailySet = <T extends MissionPoolEntry>(pool: T[], dateSeed: string, options: RotatingSetOptions): T[] => {
  const seedOptions = {
    ...(options.globalSeed ? { globalSeed: options.globalSeed } : {}),
    ...(options.scopeKey ? { scopeKey: options.scopeKey } : {})
  };
  const currentSeed = buildSeed(`daily:${dateSeed}`, {
    ...seedOptions
  });
  const previousSeeds: string[] = [];
  const repeatWindow = Math.max(
    0,
    Math.floor(
      typeof options.repeatAvoidanceWindow === 'number'
        ? options.repeatAvoidanceWindow
        : options.avoidBackToBack === false
          ? 0
          : 1
    )
  );
  let cursor = dateSeed;
  for (let i = 0; i < repeatWindow; i += 1) {
    cursor = previousDaySeed(cursor);
    previousSeeds.push(
      buildSeed(`daily:${cursor}`, {
        ...seedOptions
      })
    );
  }
  return pickWithOptionalRepeatAvoidance(pool, currentSeed, previousSeeds, {
    ...options,
    repeatAvoidanceWindow: repeatWindow
  });
};

export const getWeeklySet = <T extends MissionPoolEntry>(pool: T[], weekSeed: string, options: RotatingSetOptions): T[] => {
  const seedOptions = {
    ...(options.globalSeed ? { globalSeed: options.globalSeed } : {}),
    ...(options.scopeKey ? { scopeKey: options.scopeKey } : {})
  };
  const currentSeed = buildSeed(`weekly:${weekSeed}`, {
    ...seedOptions
  });
  const previousSeeds: string[] = [];
  const repeatWindow = Math.max(
    0,
    Math.floor(
      typeof options.repeatAvoidanceWindow === 'number'
        ? options.repeatAvoidanceWindow
        : options.avoidBackToBack === false
          ? 0
          : 1
    )
  );
  let cursor = weekSeed;
  for (let i = 0; i < repeatWindow; i += 1) {
    cursor = previousWeekSeed(cursor);
    previousSeeds.push(
      buildSeed(`weekly:${cursor}`, {
        ...seedOptions
      })
    );
  }
  return pickWithOptionalRepeatAvoidance(pool, currentSeed, previousSeeds, {
    ...options,
    repeatAvoidanceWindow: repeatWindow
  });
};
