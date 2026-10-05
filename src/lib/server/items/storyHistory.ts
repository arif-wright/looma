import { isSubscriptionActive } from '$lib/subscriptions';
import type { StoryJournalRow } from '$lib/items/story';

const rows = async (query: PromiseLike<any>): Promise<any[]> => {
  const result = await query;
  if (result.error) throw new Error('Story history visibility unavailable');
  return Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
};
const stamp = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;

/** A conservative subset of Journal's non-targeted 30/90-moment window.
 * Count timestamp ties against the budget and reserve space for the two moments
 * Journal can generate during a visit. A known exact-link exception never grants
 * this feature permission to discover older archive entries.
 */
export const withinStoryJournalWindow = (candidate: StoryJournalRow, args: {
  journal: { id: string; created_at: string }[]; otherDates: unknown[]; subscriber: boolean;
}) => {
  if (!args.journal.some((row) => row.id === candidate.id)) return false;
  const occurredAt = stamp(candidate.created_at);
  if (!Number.isFinite(occurredAt)) return false;
  // Journal's legacy query has no tie-breaker; never depend on an ambiguous
  // equal-timestamp row at its 60-record input boundary.
  if (args.journal.length >= 60 && occurredAt <= Math.min(...args.journal.map((row) => stamp(row.created_at)))) return false;
  const dates = [...args.journal.map((row) => row.created_at), ...args.otherDates];
  const aheadOrTied = dates.filter((value) => stamp(value) >= occurredAt).length;
  return aheadOrTied <= (args.subscriber ? 90 : 30) - 2;
};

/** Read timestamp-only visibility evidence. Never call Journal's writeful page loader. */
export const visibleStoryJournal = async (supabase: any, ownerId: string, candidates: StoryJournalRow[]) => {
  if (candidates.length === 0) return [];
  const [subscription, checkins, missions, games] = await Promise.all([
    rows(supabase.from('user_subscriptions').select('status, ends_at').eq('user_id', ownerId).maybeSingle()),
    rows(supabase.from('user_daily_checkins').select('created_at').eq('user_id', ownerId).order('created_at', { ascending: false }).limit(24)),
    rows(supabase.from('mission_sessions').select('completed_at, started_at').eq('user_id', ownerId).in('status', ['active', 'completed'])
      .order('completed_at', { ascending: false, nullsFirst: false }).order('started_at', { ascending: false }).limit(24)),
    rows(supabase.from('game_sessions').select('completed_at, started_at').eq('user_id', ownerId).eq('status', 'completed')
      .order('completed_at', { ascending: false }).limit(24))
  ]);
  const subscriber = isSubscriptionActive({ subscription_status: subscription[0]?.status, subscription_ends_at: subscription[0]?.ends_at });
  const globalDates = [...checkins.map((row) => row.created_at), ...missions.map((row) => row.completed_at ?? row.started_at), ...games.map((row) => row.completed_at ?? row.started_at)];
  const visibleIds = new Set<string>();
  await Promise.all([...new Set(candidates.map((row) => row.companion_id))].map(async (companionId) => {
    const [companion, journal, care, summary] = await Promise.all([
      rows(supabase.from('companions').select('id').eq('owner_id', ownerId).eq('id', companionId).maybeSingle()),
      rows(supabase.from('companion_journal_entries').select('id, created_at').eq('owner_id', ownerId).eq('companion_id', companionId)
        .order('created_at', { ascending: false }).limit(60)),
      rows(supabase.from('companion_care_events').select('created_at').eq('owner_id', ownerId).eq('companion_id', companionId)
        .order('created_at', { ascending: false }).limit(24)),
      rows(supabase.from('companion_memory_summary').select('last_built_at').eq('user_id', ownerId).eq('companion_id', companionId).maybeSingle())
    ]);
    if (!companion.some((row) => row.id === companionId)) return;
    const otherDates = [...globalDates, ...care.map((row) => row.created_at), ...summary.map((row) => row.last_built_at)];
    for (const candidate of candidates.filter((row) => row.companion_id === companionId)) {
      if (withinStoryJournalWindow(candidate, { journal, otherDates, subscriber })) visibleIds.add(candidate.id);
    }
  }));
  return candidates.filter((row) => visibleIds.has(row.id));
};
