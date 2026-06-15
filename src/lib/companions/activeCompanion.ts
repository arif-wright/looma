export type CompanionIdentity = {
  id: string;
  is_active?: boolean | null;
};

export const resolveCanonicalActiveCompanionId = (
  resolvedActiveCompanionId: string | null | undefined,
  companions: CompanionIdentity[]
) =>
  (resolvedActiveCompanionId && companions.some((companion) => companion.id === resolvedActiveCompanionId)
    ? resolvedActiveCompanionId
    : null) ??
  companions.find((companion) => companion.is_active === true)?.id ??
  companions[0]?.id ??
  null;

export const resolveCanonicalActiveCompanion = <T extends CompanionIdentity>(
  resolvedActiveCompanion: T | null | undefined,
  companions: T[]
) =>
  resolvedActiveCompanion ??
  companions.find((companion) => companion.is_active === true) ??
  companions[0] ??
  null;
