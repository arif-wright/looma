import { supabaseBrowser } from '$lib/supabaseClient';

export type MissionRow = {
  id: string;
  title: string | null;
  summary: string | null;
  difficulty: string | null;
  status: string | null;
  energy_reward: number | null;
  xp_reward: number | null;
  type?: 'identity' | 'action' | 'world' | null;
  cost?: { energy?: number } | null;
  requirements?: { minLevel?: number; minEnergy?: number } | null;
  cooldown_ms?: number | null;
  privacy_tags?: string[] | null;
  meta?: Record<string, unknown> | null;
};

export async function fetchMissionById(id: string): Promise<MissionRow | null> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from('missions')
    .select(
      'id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, cooldown_ms, privacy_tags, meta'
    )
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
    type:
      row.type === 'identity' || row.type === 'action' || row.type === 'world'
        ? row.type
        : null,
    cost:
      row.cost && typeof row.cost === 'object'
        ? (() => {
            const energy = (row.cost as Record<string, unknown>).energy;
            if (typeof energy === 'number') return { energy };
            return {};
          })()
        : null,
    requirements:
      row.requirements && typeof row.requirements === 'object'
        ? (() => {
            const raw = row.requirements as Record<string, unknown>;
            const out: { minLevel?: number; minEnergy?: number } = {};
            if (typeof raw.minLevel === 'number') out.minLevel = raw.minLevel;
            if (typeof raw.minEnergy === 'number') out.minEnergy = raw.minEnergy;
            return out;
          })()
        : null,
    cooldown_ms: typeof row.cooldown_ms === 'number' ? row.cooldown_ms : null,
    privacy_tags: Array.isArray(row.privacy_tags)
      ? row.privacy_tags.filter((entry): entry is string => typeof entry === 'string')
      : null,
    meta: (row.meta as Record<string, unknown> | null) ?? null
  };
}
