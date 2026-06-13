export type PersistedReflectionRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  meta_json?: Record<string, unknown> | null;
};

export type HomeJournalMoment = {
  id: string;
  label: string;
  title: string;
  body: string;
  href: string;
};

export type SanctuaryPlacementRow = {
  item?: {
    item_key?: string | null;
    capabilities?: string[] | null;
  } | Array<{
    item_key?: string | null;
    capabilities?: string[] | null;
  }> | null;
};

export const SHARED_REST_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export const shouldRedirectToBondGenesis = (companionCount: number | null, lookupFailed: boolean) =>
  !lookupFailed && companionCount === 0;

export const canSpawnCompanion = (companionCount: number | null, lookupFailed: boolean) =>
  !lookupFailed && companionCount === 0;

export const isFirstBondMoment = (hasCompanion: boolean, hasPersistedReconnectMemory: boolean) =>
  hasCompanion && !hasPersistedReconnectMemory;

export const isFirstBondPending = (hasCompanion: boolean, firstBondCompletedAt: string | null | undefined) =>
  hasCompanion && !firstBondCompletedAt;

export const isReconnectComplete = (memoryPersisted: boolean) => memoryPersisted;

export const persistedReflectionToContinuity = (reflection: PersistedReflectionRow | null) =>
  reflection
    ? {
        id: reflection.id,
        title: reflection.title,
        body: reflection.body,
        href: '/app/memory',
        persisted: true as const
      }
    : null;

export const journalMomentToContinuity = (moment: HomeJournalMoment | null | undefined) =>
  moment
    ? {
        id: moment.id,
        title: moment.title,
        body: moment.body,
        href: moment.href,
        persisted: true as const
      }
    : null;

export const clipRememberedReflection = (reflection: string, limit = 320) => {
  const normalized = reflection.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

export const hasUsableSharedRestPlacement = (placements: SanctuaryPlacementRow[] | null | undefined) =>
  (placements ?? []).some((placement) => {
    const item = Array.isArray(placement.item) ? placement.item[0] : placement.item;
    return item?.item_key === 'care-moss-seat' && item.capabilities?.includes('interactive');
  });

export const canCompleteSharedRest = (
  placements: SanctuaryPlacementRow[] | null | undefined,
  latestRestAt: string | null | undefined,
  nowMs = Date.now()
) => {
  if (!hasUsableSharedRestPlacement(placements)) return false;
  if (!latestRestAt) return true;
  const latestRestMs = Date.parse(latestRestAt);
  return !Number.isFinite(latestRestMs) || nowMs - latestRestMs >= SHARED_REST_COOLDOWN_MS;
};
