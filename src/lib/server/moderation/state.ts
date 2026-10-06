export type ModerationStatus = 'active' | 'muted' | 'suspended' | 'banned';
export type ModerationState = { status: ModerationStatus; until: string | null };

/** Derive current state without changing the stored moderation decision.
 * A ban never expires implicitly. Missing/invalid expiry keeps a temporary
 * restriction in force, matching existing enforcement semantics.
 */
export const effectiveModerationState = (
  row: { moderation_status?: string | null; moderation_until?: string | null } | null | undefined,
  nowMs = Date.now()
): ModerationState => {
  const rawStatus = row?.moderation_status;
  const status: ModerationStatus =
    rawStatus === 'muted' || rawStatus === 'suspended' || rawStatus === 'banned'
      ? rawStatus
      : 'active';
  const until = row?.moderation_until ?? null;
  if ((status === 'muted' || status === 'suspended') && until) {
    const untilMs = Date.parse(until);
    if (Number.isFinite(untilMs) && untilMs <= nowMs) return { status: 'active', until: null };
  }
  return { status, until };
};
