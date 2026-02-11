import type { SupabaseClient } from '@supabase/supabase-js';

type GrantArgs = {
  supabase: SupabaseClient;
  userId: string;
  xp?: number | null;
  energy?: number | null;
  energyCap?: number | null;
};

type GrantResult =
  | { ok: true; xpGranted: number; energyGranted: number }
  | { ok: false; status: number; code: string; message: string };

export const grantMissionRewards = async ({
  supabase,
  userId,
  xp = 0,
  energy = 0,
  energyCap = null
}: GrantArgs): Promise<GrantResult> => {
  const xpAmount = Number.isFinite(xp) ? Math.max(0, Math.floor(xp as number)) : 0;
  const energyAmount = Number.isFinite(energy) ? Math.max(0, Math.floor(energy as number)) : 0;
  const cap = Number.isFinite(energyCap) ? Math.max(0, Math.floor(energyCap as number)) : null;

  if (xpAmount > 0) {
    const { error: xpError } = await supabase.rpc('fn_award_game_xp', {
      p_user: userId,
      p_xp: xpAmount
    });
    if (xpError) {
      return { ok: false, status: 500, code: 'xp_grant_failed', message: 'Unable to grant mission XP.' };
    }
  }

  let energyGranted = 0;
  if (energyAmount > 0) {
    const { data, error: energyError } = await supabase.rpc('fn_profile_grant_energy', {
      p_user: userId,
      p_energy: energyAmount,
      p_cap: cap
    });
    if (energyError) {
      return {
        ok: false,
        status: 500,
        code: 'energy_grant_failed',
        message: 'Unable to grant mission energy.'
      };
    }
    const row = Array.isArray(data) ? data[0] : null;
    energyGranted = typeof row?.granted === 'number' ? Math.max(0, Math.floor(row.granted)) : 0;
  }

  return { ok: true, xpGranted: xpAmount, energyGranted };
};
