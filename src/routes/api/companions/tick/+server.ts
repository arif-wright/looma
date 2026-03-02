import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { syncPlayerBondState } from '$lib/server/companions/bonds';
import { createCompanionNudgeNotification } from '$lib/server/notifications';
import {
  deriveCompanionChapterDigest,
  deriveWeeklyCompanionArc,
  ensureCompanionChapterDigest
} from '$lib/server/companions/journal';

type TickRow = {
  companion_id: string;
  affection: number;
  trust: number;
  energy: number;
  mood: string | null;
  last_passive_tick: string | null;
  last_daily_bonus_at: string | null;
  event_id: string | null;
  event_action: string | null;
  event_note: string | null;
  event_created_at: string | null;
  affection_delta: number | null;
  trust_delta: number | null;
  energy_delta: number | null;
  bond_score?: number | null;
  bond_level?: number | null;
};

type NudgeReason = 'low_energy' | 'care_due';
type CompanionMetaRow = {
  id: string;
  name: string;
  mood: string | null;
  energy: number | null;
  stats:
    | {
        fed_at: string | null;
        played_at: string | null;
        groomed_at: string | null;
      }[]
    | {
        fed_at: string | null;
        played_at: string | null;
        groomed_at: string | null;
      }
    | null;
};

const LOW_ENERGY_THRESHOLD = 25;
const CARE_STALE_HOURS = 18;
const NUDGE_DEDUP_HOURS = 12;

const toTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const stamp = Date.parse(value);
  return Number.isNaN(stamp) ? null : stamp;
};

const extractStats = (value: CompanionMetaRow['stats']) => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const normalizeRows = (rows: unknown): TickRow[] => {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is TickRow => typeof row?.companion_id === 'string');
};

export const GET: RequestHandler = async () => {
  return json({ error: 'method_not_allowed' }, { status: 405 });
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const playerId = session.user.id;
  const statsMap = new Map<
    string,
    {
      id: string;
      affection: number;
      trust: number;
      energy: number;
      mood: string | null;
      lastPassiveTick: string | null;
      lastDailyBonusAt: string | null;
      bondLevel: number;
      bondScore: number;
    }
  >();
  const newEvents: Array<{
    id: string;
    companionId: string;
    kind: 'passive' | 'daily_bonus';
    message: string;
    createdAt: string;
    affectionDelta: number;
    trustDelta: number;
    energyDelta: number;
  }> = [];
  const seenEventIds = new Set<string>();
  const upsertRows = (rows: TickRow[]) => {
    rows.forEach((row) => {
      statsMap.set(row.companion_id, {
        id: row.companion_id,
        affection: row.affection ?? 0,
        trust: row.trust ?? 0,
        energy: row.energy ?? 0,
        mood: row.mood ?? null,
        lastPassiveTick: row.last_passive_tick ?? null,
        lastDailyBonusAt: row.last_daily_bonus_at ?? null,
        bondLevel: row.bond_level ?? 0,
        bondScore: row.bond_score ?? 0
      });

      if (row.event_id && row.event_action && row.event_created_at && !seenEventIds.has(row.event_id)) {
        const action = row.event_action as 'passive' | 'daily_bonus';
        if (action === 'passive' || action === 'daily_bonus') {
          newEvents.push({
            id: row.event_id,
            companionId: row.companion_id,
            kind: action,
            message: row.event_note ?? (action === 'daily_bonus' ? 'Brightened when you checked in today.' : 'Rested while you were away.'),
            createdAt: row.event_created_at,
            affectionDelta: row.affection_delta ?? 0,
            trustDelta: row.trust_delta ?? 0,
            energyDelta: row.energy_delta ?? 0
          });
          seenEventIds.add(row.event_id);
        }
      }
    });
  };

  const tickResult = await supabase.rpc('tick_companions_for_player', { p_player_id: playerId });
  if (tickResult.error) {
    return json({ error: tickResult.error.message ?? 'passive_tick_failed' }, { status: 400 });
  }
  upsertRows(normalizeRows(tickResult.data));

  const bonusResult = await supabase.rpc('apply_daily_companion_bonus', { p_player_id: playerId });
  if (bonusResult.error) {
    return json({ error: bonusResult.error.message ?? 'daily_bonus_failed' }, { status: 400 });
  }
  upsertRows(normalizeRows(bonusResult.data));

  try {
    const { rows, milestones } = await syncPlayerBondState(supabase, playerId);
    rows.forEach((row) => {
      const entry = statsMap.get(row.companion_id);
      if (!entry) return;
      entry.bondLevel = row.bond_level ?? entry.bondLevel;
      entry.bondScore = row.bond_score ?? entry.bondScore;
    });
    milestones.forEach((event) => {
      const eventId = typeof event?.id === 'string' ? event.id : null;
      if (!eventId || seenEventIds.has(eventId)) return;
      newEvents.push({
        id: eventId,
        companionId: event.companion_id,
        kind: event.action as any,
        message: event.note ?? 'Bond milestone reached.',
        createdAt: event.created_at ?? new Date().toISOString(),
        affectionDelta: event.affection_delta ?? 0,
        trustDelta: event.trust_delta ?? 0,
        energyDelta: event.energy_delta ?? 0
      });
      seenEventIds.add(eventId);
    });
  } catch (err) {
    console.error('[companions/tick] bond sync failed', err);
  }

  try {
    const companionIds = Array.from(statsMap.keys());
    if (companionIds.length > 0) {
      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [metaResult, recentNudgesResult, recentCareResult, recentSocialResult, recentCheckinsResult, recentMissionResult, recentGameResult, preferenceRes, rewardsRes] = await Promise.all([
        supabase
          .from('companions')
          .select('id,name,mood,energy,stats:companion_stats(fed_at,played_at,groomed_at)')
          .eq('owner_id', playerId)
          .in('id', companionIds),
        supabase
          .from('notifications')
          .select('target_id, metadata')
          .eq('user_id', playerId)
          .eq('kind', 'companion_nudge')
          .gte('created_at', new Date(Date.now() - NUDGE_DEDUP_HOURS * 60 * 60 * 1000).toISOString())
        ,
        supabase
          .from('companion_care_events')
          .select('companion_id, created_at')
          .eq('owner_id', playerId)
          .in('companion_id', companionIds)
          .gte('created_at', weekAgoIso),
        supabase
          .from('companion_journal_entries')
          .select('companion_id, source_type, created_at')
          .eq('owner_id', playerId)
          .in('companion_id', companionIds)
          .in('source_type', ['post', 'message', 'circle_announcement'])
          .gte('created_at', weekAgoIso),
        supabase
          .from('user_daily_checkins')
          .select('id')
          .eq('user_id', playerId)
          .gte('created_at', weekAgoIso),
        supabase
          .from('mission_sessions')
          .select('id, started_at, completed_at, status')
          .eq('user_id', playerId)
          .in('status', ['active', 'completed'])
          .or(`started_at.gte.${weekAgoIso},completed_at.gte.${weekAgoIso}`),
        supabase
          .from('game_sessions')
          .select('id, started_at, completed_at')
          .eq('user_id', playerId)
          .eq('status', 'completed')
          .or(`started_at.gte.${weekAgoIso},completed_at.gte.${weekAgoIso}`),
        supabase
          .from('user_preferences')
          .select('featured_companion_reward_key, featured_companion_reward_companion_id')
          .eq('user_id', playerId)
          .maybeSingle(),
        supabase
          .from('companion_chapter_rewards')
          .select('companion_id, reward_key, reward_title, reward_tone, unlocked_at')
          .eq('owner_id', playerId)
          .in('companion_id', companionIds)
          .order('unlocked_at', { ascending: false })
      ]);

      if (metaResult.error) {
        console.error('[companions/tick] companion meta lookup failed', metaResult.error);
      }
      if (recentNudgesResult.error) {
        console.error('[companions/tick] recent nudge lookup failed', recentNudgesResult.error);
      }
      if (recentCareResult.error) {
        console.error('[companions/tick] recent care lookup failed', recentCareResult.error);
      }
      if (recentSocialResult.error) {
        console.error('[companions/tick] recent social lookup failed', recentSocialResult.error);
      }
      if (recentCheckinsResult.error) {
        console.error('[companions/tick] recent checkins lookup failed', recentCheckinsResult.error);
      }
      if (recentMissionResult.error) {
        console.error('[companions/tick] recent mission lookup failed', recentMissionResult.error);
      }
      if (recentGameResult.error) {
        console.error('[companions/tick] recent game lookup failed', recentGameResult.error);
      }
      if (preferenceRes.error && preferenceRes.error.code !== 'PGRST116') {
        console.error('[companions/tick] featured keepsake lookup failed', preferenceRes.error);
      }
      if (rewardsRes.error) {
        console.error('[companions/tick] chapter rewards lookup failed', rewardsRes.error);
      }

      const dedupe = new Set<string>();
      (recentNudgesResult.data ?? []).forEach((row) => {
        const companionId = typeof row?.target_id === 'string' ? row.target_id : null;
        const reason =
          typeof (row?.metadata as Record<string, unknown> | null)?.reason === 'string'
            ? ((row?.metadata as Record<string, unknown>).reason as NudgeReason)
            : null;
        if (companionId && reason) {
          dedupe.add(`${companionId}:${reason}`);
        }
      });

      const recentCareCounts = new Map<string, number>();
      ((recentCareResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
        const companionId = typeof row.companion_id === 'string' ? row.companion_id : null;
        if (!companionId) return;
        recentCareCounts.set(companionId, (recentCareCounts.get(companionId) ?? 0) + 1);
      });

      const recentSocialCounts = new Map<string, number>();
      ((recentSocialResult.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
        const companionId = typeof row.companion_id === 'string' ? row.companion_id : null;
        if (!companionId) return;
        recentSocialCounts.set(companionId, (recentSocialCounts.get(companionId) ?? 0) + 1);
      });

      const recentCheckins = Array.isArray(recentCheckinsResult.data) ? recentCheckinsResult.data.length : 0;
      const recentMissions = Array.isArray(recentMissionResult.data) ? recentMissionResult.data.length : 0;
      const recentGames = Array.isArray(recentGameResult.data) ? recentGameResult.data.length : 0;

      const featuredRewardKey =
        typeof preferenceRes.data?.featured_companion_reward_key === 'string'
          ? preferenceRes.data.featured_companion_reward_key
          : null;
      const featuredCompanionId =
        typeof preferenceRes.data?.featured_companion_reward_companion_id === 'string'
          ? preferenceRes.data.featured_companion_reward_companion_id
          : null;

      const rewardsByCompanionId = ((rewardsRes.data ?? []) as Array<Record<string, unknown>>).reduce<
        Record<string, Array<{ key: string; title: string; tone: 'care' | 'social' | 'mission' | 'play' | 'bond' }>>
      >((acc, row) => {
        const companionId = typeof row.companion_id === 'string' ? row.companion_id : '';
        const tone = row.reward_tone;
        if (
          !companionId ||
          (tone !== 'care' &&
            tone !== 'social' &&
            tone !== 'mission' &&
            tone !== 'play' &&
            tone !== 'bond')
        ) {
          return acc;
        }
        acc[companionId] ??= [];
        acc[companionId].push({
          key: typeof row.reward_key === 'string' ? row.reward_key : 'reward',
          title: typeof row.reward_title === 'string' ? row.reward_title : 'Companion keepsake',
          tone
        });
        return acc;
      }, {});

      const dueCutoff = Date.now() - CARE_STALE_HOURS * 60 * 60 * 1000;
      for (const companion of (metaResult.data ?? []) as CompanionMetaRow[]) {
        const stats = extractStats(companion.stats);
        const energy = companion.energy ?? statsMap.get(companion.id)?.energy ?? null;
        const lowEnergy = typeof energy === 'number' && energy <= LOW_ENERGY_THRESHOLD;

        const fedAt = toTime(stats?.fed_at ?? null);
        const playedAt = toTime(stats?.played_at ?? null);
        const groomedAt = toTime(stats?.groomed_at ?? null);
        const latestCare = [fedAt, playedAt, groomedAt].filter((stamp): stamp is number => typeof stamp === 'number');
        const isCareDue = latestCare.length === 0 || Math.max(...latestCare) < dueCutoff;

        const reasons: NudgeReason[] = [];
        if (lowEnergy) reasons.push('low_energy');
        if (isCareDue) reasons.push('care_due');

        for (const reason of reasons) {
          const key = `${companion.id}:${reason}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          await createCompanionNudgeNotification(supabase, {
            userId: playerId,
            companionId: companion.id,
            reason,
            companionName: companion.name,
            mood: companion.mood,
            energy
          });
        }

        const chapterRewards = rewardsByCompanionId[companion.id] ?? [];
        const chapter =
          (featuredCompanionId === companion.id && featuredRewardKey
            ? chapterRewards.find((reward) => reward.key === featuredRewardKey) ?? null
            : null) ??
          chapterRewards[0] ??
          null;
        const weeklyArc = deriveWeeklyCompanionArc({
          companionName: companion.name,
          careMoments: recentCareCounts.get(companion.id) ?? 0,
          missionMoments: recentMissions,
          gameMoments: recentGames,
          socialMoments: recentSocialCounts.get(companion.id) ?? 0,
          checkins: recentCheckins
        });
        const digest = deriveCompanionChapterDigest({
          companionName: companion.name,
          chapter: chapter
            ? {
                title: chapter.title,
                tone: chapter.tone
              }
            : null,
          weeklyArc,
          careMoments: recentCareCounts.get(companion.id) ?? 0,
          missionMoments: recentMissions,
          gameMoments: recentGames,
          socialMoments: recentSocialCounts.get(companion.id) ?? 0,
          checkins: recentCheckins
        });
        await ensureCompanionChapterDigest(supabase, {
          ownerId: playerId,
          companionId: companion.id,
          digest,
          chapterTitle: chapter?.title ?? weeklyArc.title
        });
      }
    }
  } catch (err) {
    console.error('[companions/tick] companion nudge creation failed', err);
  }

  return json({
    companions: Array.from(statsMap.values()),
    newEvents
  });
};
