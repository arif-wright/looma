import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

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
        lastDailyBonusAt: row.last_daily_bonus_at ?? null
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

  return json({
    companions: Array.from(statsMap.values()),
    newEvents
  });
};
