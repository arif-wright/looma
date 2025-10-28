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
  return {
    id: data.id,
    title: data.title ?? null,
    summary: data.summary ?? null,
    difficulty: data.difficulty ?? null,
    status: data.status ?? null,
    energy_reward: data.energy_reward ?? null,
    xp_reward: data.xp_reward ?? null,
    meta: (data.meta as Record<string, unknown> | null) ?? null
  };
}
