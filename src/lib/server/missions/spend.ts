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

  const { data: profile, error: loadError } = await supabase
    .from('profiles')
    .select('energy')
    .eq('id', userId)
    .maybeSingle();

  if (loadError) {
    return {
      ok: false,
      status: 500,
      code: 'profile_load_failed',
      message: 'Unable to read profile energy.'
    };
  }

  const currentEnergy = typeof profile?.energy === 'number' ? profile.energy : 0;
  if (currentEnergy < cost) {
    return {
      ok: false,
      status: 409,
      code: 'insufficient_energy',
      message: 'Not enough energy to start this mission.'
    };
  }

  const nextEnergy = currentEnergy - cost;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ energy: nextEnergy })
    .eq('id', userId);

  if (updateError) {
    return {
      ok: false,
      status: 500,
      code: 'profile_update_failed',
      message: 'Unable to spend mission energy.'
    };
  }

  return { ok: true, energySpent: cost };
};
