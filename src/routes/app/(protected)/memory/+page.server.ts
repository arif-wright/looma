import type { PageServerLoad } from './$types';
import {
  deriveEmotionalStateFromCompanionStats,
  type EmotionalStateSnapshot
} from '$lib/server/emotionalState';

type CompanionRow = {
  id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  updated_at: string | null;
  affection: number | null;
  trust: number | null;
  energy: number | null;
  mood: string | null;
  stats:
    | {
        fed_at?: string | null;
        played_at?: string | null;
        groomed_at?: string | null;
        last_passive_tick?: string | null;
        care_streak?: number | null;
        bond_level?: number | null;
        bond_score?: number | null;
      }
    | {
        fed_at?: string | null;
        played_at?: string | null;
        groomed_at?: string | null;
        last_passive_tick?: string | null;
        care_streak?: number | null;
        bond_level?: number | null;
        bond_score?: number | null;
      }[]
    | null;
};

type MemorySummaryRow = {
  summary_text: string;
  highlights_json: string[] | null;
  last_built_at: string | null;
  source_window_json: {
    windowDays?: number;
    counts?: {
      missionCompletions?: number;
      gameCompletions?: number;
      missionStarts?: number;
    };
  } | null;
};

type EmotionalStateRow = {
  mood: string | null;
  trust: number | null;
  bond: number | null;
  streak_momentum: number | null;
  volatility: number | null;
  recent_tone: string | null;
  last_milestone_at: string | null;
  updated_at: string | null;
};

type CareEventRow = {
  id: string;
  action: string | null;
  affection_delta: number | null;
  trust_delta: number | null;
  energy_delta: number | null;
  note: string | null;
  created_at: string;
};

type CheckinRow = {
  id: string;
  mood: string;
  checkin_date: string;
  created_at: string;
};

type MissionSessionRow = {
  id: string;
  mission_id: string | null;
  mission_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type MissionTitleRow = {
  id: string;
  title: string | null;
};

type GameSessionRow = {
  id: string;
  game_id: string;
  status: string | null;
  score: number | null;
  duration_ms: number | null;
  completed_at: string | null;
  started_at: string | null;
};

type GameTitleRow = {
  id: string;
  slug: string;
  name: string;
};

type TimelineItem = {
  id: string;
  kind: 'memory' | 'care' | 'checkin' | 'mission' | 'game';
  title: string;
  body: string;
  occurredAt: string;
  meta?: string | null;
};

const COMPANION_SELECT =
  'id, name, species, avatar_url, is_active, updated_at, affection, trust, energy, mood, stats:companion_stats(fed_at, played_at, groomed_at, last_passive_tick, care_streak, bond_level, bond_score)';

const formatMood = (value: string | null | undefined) => {
  if (!value) return 'Steady';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatDuration = (durationMs: number | null | undefined) => {
  if (!durationMs || durationMs <= 0) return null;
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 1) return 'Under 1 min';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
};

const formatDelta = (value: number | null | undefined, label: string) => {
  if (typeof value !== 'number' || value === 0) return null;
  return `${value > 0 ? '+' : ''}${value} ${label}`;
};

const toStamp = (value: string | null | undefined) => {
  if (!value) return null;
  const stamp = Date.parse(value);
  return Number.isNaN(stamp) ? null : stamp;
};

const pickLatestIso = (values: Array<string | null | undefined>) => {
  let latest: string | null = null;
  let latestStamp = -Infinity;
  for (const value of values) {
    const stamp = toStamp(value);
    if (stamp === null) continue;
    if (stamp > latestStamp) {
      latestStamp = stamp;
      latest = value ?? null;
    }
  }
  return latest;
};

const formatElapsedLabel = (iso: string | null | undefined) => {
  const stamp = toStamp(iso);
  if (stamp === null) return 'No recent care logged';
  const elapsedMs = Math.max(0, Date.now() - stamp);
  if (elapsedMs < 60 * 60 * 1000) return 'Cared for within the hour';
  if (elapsedMs < 24 * 60 * 60 * 1000) return 'Cared for today';
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  if (days === 1) return 'Last care was yesterday';
  if (days < 7) return `Last care was ${days} days ago`;
  return 'Care has gone quiet for over a week';
};

const normalizeStats = (value: CompanionRow['stats']) => (Array.isArray(value) ? value[0] ?? null : value ?? null);

const buildRelationshipReasons = (args: {
  companion: CompanionRow;
  emotionalState: EmotionalStateSnapshot;
  summary: MemorySummaryRow | null;
  careRows: CareEventRow[];
  missionRows: MissionSessionRow[];
  gameRows: GameSessionRow[];
  checkins: CheckinRow[];
}) => {
  const { companion, emotionalState, summary, careRows, missionRows, gameRows, checkins } = args;
  const reasons: string[] = [];
  const stats = normalizeStats(companion.stats);
  const lastCareAt = pickLatestIso([stats?.fed_at, stats?.played_at, stats?.groomed_at, careRows[0]?.created_at ?? null]);
  const affection = companion.affection ?? 0;
  const trust = companion.trust ?? 0;
  const energy = companion.energy ?? 0;
  const completedMissions = missionRows.filter((row) => row.status === 'completed').length;
  const completedGames = gameRows.length;

  if (energy <= 20) {
    reasons.push('Energy is low, so this companion is reading as more fragile and quiet.');
  } else if (energy >= 70) {
    reasons.push('Energy is high, which supports a brighter and more responsive presence.');
  }

  if (trust >= 70 && affection >= 70) {
    reasons.push('Trust and affection are both strong, so the relationship feels settled rather than uncertain.');
  } else if (trust <= 35 || affection <= 35) {
    reasons.push('Trust or affection is still rebuilding, so the bond reads as less secure.');
  }

  if (emotionalState.streakMomentum >= 0.55) {
    reasons.push('Recent consistency is reinforcing the emotional state, not just one isolated action.');
  }

  if (completedGames > completedMissions && completedGames > 0) {
    reasons.push('Recent momentum is coming more from play sessions than from missions.');
  } else if (completedMissions > 0) {
    reasons.push('Mission progress is currently doing more of the relationship-shaping work.');
  }

  if (checkins.length > 0) {
    reasons.push(`Your latest check-in was ${formatMood(checkins[0]?.mood)}.`);
  }

  if (!summary?.last_built_at) {
    reasons.push('This journal summary is still new, so it may be missing older context until more events accumulate.');
  }

  return {
    headline:
      emotionalState.mood === 'luminous'
        ? `${companion.name} feels bright and connected`
        : emotionalState.mood === 'dim'
        ? `${companion.name} feels more withdrawn right now`
        : `${companion.name} feels steady right now`,
    reasons: reasons.slice(0, 4),
    lastCareLabel: formatElapsedLabel(lastCareAt)
  };
};

const buildWeeklyPulse = (args: {
  careRows: CareEventRow[];
  missionRows: MissionSessionRow[];
  gameRows: GameSessionRow[];
  checkins: CheckinRow[];
  summary: MemorySummaryRow | null;
}) => {
  const { careRows, missionRows, gameRows, checkins, summary } = args;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const careMoments = careRows.filter((row) => (toStamp(row.created_at) ?? 0) >= weekAgo).length;
  const missionMoments = missionRows.filter((row) => (toStamp(row.completed_at ?? row.started_at) ?? 0) >= weekAgo).length;
  const gameMoments = gameRows.filter((row) => (toStamp(row.completed_at ?? row.started_at) ?? 0) >= weekAgo).length;
  const recentCheckins = checkins.filter((row) => (toStamp(row.created_at) ?? 0) >= weekAgo).length;
  const counts = [
    { key: 'care', count: careMoments, label: 'care' },
    { key: 'missions', count: missionMoments, label: 'missions' },
    { key: 'games', count: gameMoments, label: 'games' }
  ].sort((a, b) => b.count - a.count);

  return {
    careMoments,
    missionMoments,
    gameMoments,
    recentCheckins,
    dominantLabel: counts[0]?.count ? counts[0].label : 'quiet',
    summaryWindowDays: summary?.source_window_json?.windowDays ?? null
  };
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return {
      companions: [],
      selectedCompanionId: null,
      selectedCompanion: null,
      summary: null,
      emotionalState: null,
      timeline: [] as TimelineItem[]
    };
  }

  const companionsRes = await supabase
    .from('companions')
    .select(COMPANION_SELECT)
    .eq('owner_id', userId)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const companions = (companionsRes.data ?? []) as CompanionRow[];
  const requestedCompanionId = url.searchParams.get('companion');
  const selectedCompanion =
    companions.find((companion) => companion.id === requestedCompanionId) ??
    companions.find((companion) => companion.is_active) ??
    companions[0] ??
    null;

  if (!selectedCompanion) {
    return {
      companions,
      selectedCompanionId: null,
      selectedCompanion: null,
      summary: null,
      emotionalState: null,
      relationshipPulse: null,
      weeklyPulse: null,
      timeline: [] as TimelineItem[]
    };
  }

  const selectedCompanionId = selectedCompanion.id;

  const [summaryRes, emotionalRes, careRes, checkinsRes, missionRes, gameRes] = await Promise.all([
    supabase
      .from('companion_memory_summary')
      .select('summary_text, highlights_json, last_built_at, source_window_json')
      .eq('user_id', userId)
      .eq('companion_id', selectedCompanionId)
      .maybeSingle(),
    supabase
      .from('companion_emotional_state')
      .select('mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at, updated_at')
      .eq('user_id', userId)
      .eq('companion_id', selectedCompanionId)
      .maybeSingle(),
    supabase
      .from('companion_care_events')
      .select('id, action, affection_delta, trust_delta, energy_delta, note, created_at')
      .eq('owner_id', userId)
      .eq('companion_id', selectedCompanionId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('user_daily_checkins')
      .select('id, mood, checkin_date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('mission_sessions')
      .select('id, mission_id, mission_type, status, started_at, completed_at')
      .eq('user_id', userId)
      .in('status', ['active', 'completed'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('started_at', { ascending: false })
      .limit(10),
    supabase
      .from('game_sessions')
      .select('id, game_id, status, score, duration_ms, completed_at, started_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10)
  ]);

  const missionRows = (missionRes.data ?? []) as MissionSessionRow[];
  const missionIds = missionRows
    .map((row) => row.mission_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const missionTitlesRes =
    missionIds.length > 0
      ? await supabase.from('missions').select('id, title').in('id', missionIds)
      : { data: [] as MissionTitleRow[] };
  const missionTitles = new Map(
    ((missionTitlesRes.data ?? []) as MissionTitleRow[]).map((row) => [row.id, row.title ?? 'Mission'])
  );

  const gameRows = (gameRes.data ?? []) as GameSessionRow[];
  const gameIds = [...new Set(gameRows.map((row) => row.game_id).filter(Boolean))];
  const gameTitlesRes =
    gameIds.length > 0
      ? await supabase.from('game_titles').select('id, slug, name').in('id', gameIds)
      : { data: [] as GameTitleRow[] };
  const gameTitles = new Map(
    ((gameTitlesRes.data ?? []) as GameTitleRow[]).map((row) => [row.id, row])
  );

  const summary = (summaryRes.data as MemorySummaryRow | null) ?? null;
  const emotionalRow = (emotionalRes.data as EmotionalStateRow | null) ?? null;
  const emotionalState: EmotionalStateSnapshot =
    emotionalRow
      ? {
          mood: emotionalRow.mood === 'luminous' || emotionalRow.mood === 'dim' ? emotionalRow.mood : 'steady',
          trust: emotionalRow.trust ?? 0,
          bond: emotionalRow.bond ?? 0,
          streakMomentum: emotionalRow.streak_momentum ?? 0,
          volatility: emotionalRow.volatility ?? 0,
          recentTone: emotionalRow.recent_tone ?? null,
          lastMilestoneAt: emotionalRow.last_milestone_at ?? null
        }
      : deriveEmotionalStateFromCompanionStats({
          affection: selectedCompanion.affection,
          trust: selectedCompanion.trust,
          energy: selectedCompanion.energy,
          mood: selectedCompanion.mood
        });

  const timeline: TimelineItem[] = [];

  if (summary?.summary_text && summary.last_built_at) {
    timeline.push({
      id: `memory-${selectedCompanionId}`,
      kind: 'memory',
      title: 'Memory refreshed',
      body: summary.summary_text,
      occurredAt: summary.last_built_at,
      meta:
        typeof summary.source_window_json?.windowDays === 'number'
          ? `Built from the last ${summary.source_window_json.windowDays} days`
          : null
    });
  }

  for (const row of (careRes.data ?? []) as CareEventRow[]) {
    const meta = [
      formatDelta(row.affection_delta, 'affection'),
      formatDelta(row.trust_delta, 'trust'),
      formatDelta(row.energy_delta, 'energy')
    ]
      .filter(Boolean)
      .join(' · ');

    timeline.push({
      id: `care-${row.id}`,
      kind: 'care',
      title: row.note?.trim() || `${formatMood(row.action)} ritual`,
      body: row.note?.trim() || 'You spent time tending to your companion.',
      occurredAt: row.created_at,
      meta: meta || null
    });
  }

  for (const row of (checkinsRes.data ?? []) as CheckinRow[]) {
    timeline.push({
      id: `checkin-${row.id}`,
      kind: 'checkin',
      title: `Check-in: ${formatMood(row.mood)}`,
      body: `You checked in on ${row.checkin_date}.`,
      occurredAt: row.created_at,
      meta: null
    });
  }

  for (const row of missionRows) {
    const occurredAt = row.completed_at ?? row.started_at;
    if (!occurredAt) continue;
    const missionTitle = (row.mission_id && missionTitles.get(row.mission_id)) || 'Mission';
    timeline.push({
      id: `mission-${row.id}`,
      kind: 'mission',
      title: row.status === 'completed' ? `Mission completed: ${missionTitle}` : `Mission started: ${missionTitle}`,
      body:
        row.status === 'completed'
          ? 'A meaningful step was completed in your arc.'
          : 'A new mission thread was opened.',
      occurredAt,
      meta: row.mission_type ? `${formatMood(row.mission_type)} mission` : null
    });
  }

  for (const row of gameRows) {
    const occurredAt = row.completed_at ?? row.started_at;
    if (!occurredAt) continue;
    const game = gameTitles.get(row.game_id);
    timeline.push({
      id: `game-${row.id}`,
      kind: 'game',
      title: `Game completed: ${game?.name ?? 'Game session'}`,
      body:
        typeof row.score === 'number'
          ? `You finished with a score of ${row.score.toLocaleString()}.`
          : 'A play session was completed.',
      occurredAt,
      meta: formatDuration(row.duration_ms)
    });
  }

  timeline.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const careRows = (careRes.data ?? []) as CareEventRow[];
  const checkinRows = (checkinsRes.data ?? []) as CheckinRow[];
  const relationshipPulse = buildRelationshipReasons({
    companion: selectedCompanion,
    emotionalState,
    summary,
    careRows,
    missionRows,
    gameRows,
    checkins: checkinRows
  });
  const weeklyPulse = buildWeeklyPulse({
    careRows,
    missionRows,
    gameRows,
    checkins: checkinRows,
    summary
  });

  return {
    companions,
    selectedCompanionId,
    selectedCompanion,
    summary,
    emotionalState,
    relationshipPulse,
    weeklyPulse,
    timeline: timeline.slice(0, 30)
  };
};
