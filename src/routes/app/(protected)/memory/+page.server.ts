import type { PageServerLoad } from './$types';

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
  'id, name, species, avatar_url, is_active, updated_at, affection, trust, energy, mood';

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
  const emotionalState = (emotionalRes.data as EmotionalStateRow | null) ?? null;

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

  return {
    companions,
    selectedCompanionId,
    selectedCompanion,
    summary,
    emotionalState,
    timeline: timeline.slice(0, 30)
  };
};
