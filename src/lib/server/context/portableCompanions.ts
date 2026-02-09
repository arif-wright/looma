import type { PortableCompanionEntry, PortableCompanions, PortableState } from '$lib/types/portableState';
import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';

const DEFAULT_COMPANION_ID = 'muse';

const defaultRoster = (): PortableCompanionEntry[] => [
  {
    id: DEFAULT_COMPANION_ID,
    name: 'Muse',
    archetype: 'Harmonizer',
    unlocked: true,
    cosmetics: normalizeCompanionCosmetics(null),
    cosmeticsUnlocked: [],
    stats: {
      bond: 0,
      level: 1
    }
  }
];

const safeString = (value: unknown, fallback: string, max = 80) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
};

const normalizeCosmetics = (input: unknown): PortableCompanionEntry['cosmetics'] => {
  return normalizeCompanionCosmetics(input);
};

const toNonNegativeInt = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const normalizeCosmeticsUnlocked = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const token = raw.trim().slice(0, 80);
    if (!token) continue;
    unique.add(token);
    if (unique.size >= 64) break;
  }
  return [...unique];
};

const normalizeRosterEntry = (raw: unknown): PortableCompanionEntry | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const id = safeString(entry.id, '');
  if (!id) return null;
  return {
    id,
    name: safeString(entry.name, 'Companion'),
    archetype: safeString(entry.archetype, 'Unknown'),
    unlocked: entry.unlocked !== false,
    cosmetics: normalizeCosmetics(entry.cosmetics),
    cosmeticsUnlocked: normalizeCosmeticsUnlocked(entry.cosmeticsUnlocked),
    stats: {
      bond: toNonNegativeInt((entry.stats as Record<string, unknown> | undefined)?.bond, 0),
      level: Math.max(1, toNonNegativeInt((entry.stats as Record<string, unknown> | undefined)?.level, 1))
    }
  };
};

export const normalizePortableCompanions = (input: unknown): PortableCompanions => {
  const fallback = defaultRoster();

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { activeId: fallback[0].id, roster: fallback };
  }

  const payload = input as Record<string, unknown>;
  const rawRoster = Array.isArray(payload.roster) ? payload.roster : [];
  const dedup = new Map<string, PortableCompanionEntry>();

  for (const raw of rawRoster) {
    const normalized = normalizeRosterEntry(raw);
    if (!normalized) continue;
    if (!dedup.has(normalized.id)) dedup.set(normalized.id, normalized);
  }

  const roster = [...dedup.values()];
  if (roster.length === 0) {
    return { activeId: fallback[0].id, roster: fallback };
  }

  const activeIdRaw = safeString(payload.activeId, '');
  const activeEntry = roster.find((entry) => entry.id === activeIdRaw);
  const firstUnlocked = roster.find((entry) => entry.unlocked);
  const activeId = activeEntry?.id ?? firstUnlocked?.id ?? roster[0].id;

  return { activeId, roster };
};

export const withNormalizedCompanions = (state: PortableState): PortableState => ({
  ...state,
  companions: normalizePortableCompanions(state.companions)
});
