import type { SupabaseClient } from '@supabase/supabase-js';

type SpendArgs = {
  supabase: SupabaseClient;
  userId: string;
  energy: number;
};

type SpendResult =
  | { ok: true; energySpent: number }
  | { ok: false; status: number; code: string; message: string };

// Mission energy spend helper used by action missions.
export const spend = async ({ supabase, userId, energy }: SpendArgs): Promise<SpendResult> => {
  const cost = Number.isFinite(energy) ? Math.max(0, Math.floor(energy)) : 0;
  if (cost === 0) return { ok: true, energySpent: 0 };

  const { data, error } = await supabase.rpc('fn_profile_spend_energy', {
    p_user: userId,
    p_energy: cost
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      code: 'energy_spend_failed',
      message: 'Unable to spend mission energy.'
    };
  }

  const row = Array.isArray(data) ? data[0] : null;
  const spent = typeof row?.spent === 'number' ? row.spent : 0;
  if (spent < cost) {
    return {
      ok: false,
      status: 409,
      code: 'insufficient_energy',
      message: 'Not enough energy to start this mission.'
    };
  }

  return { ok: true, energySpent: cost };
};
