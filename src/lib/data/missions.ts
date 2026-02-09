import { supabaseBrowser } from '$lib/supabaseClient';

export type MissionRow = {
  id: string;
  title: string | null;
  summary: string | null;
  difficulty: string | null;
  status: string | null;
  energy_reward: number | null;
  xp_reward: number | null;
  meta?: Record<string, unknown> | null;
};

export async function fetchMissionById(id: string): Promise<MissionRow | null> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from('missions')
    .select('id, title, summary, difficulty, status, energy_reward, xp_reward, meta')
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    title: typeof row.title === 'string' ? row.title : null,
    summary: typeof row.summary === 'string' ? row.summary : null,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : null,
    status: typeof row.status === 'string' ? row.status : null,
    energy_reward: typeof row.energy_reward === 'number' ? row.energy_reward : null,
    xp_reward: typeof row.xp_reward === 'number' ? row.xp_reward : null,
    meta: (row.meta as Record<string, unknown> | null) ?? null
  };
}
