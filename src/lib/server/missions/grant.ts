import type { SupabaseClient } from '@supabase/supabase-js';
import { grant } from '$lib/server/economy/transactions';

type GrantArgs = {
  supabase: SupabaseClient;
  userId: string;
  xp?: number | null;
  energy?: number | null;
  energyCap?: number | null;
  source?: string;
  idempotencyKey?: string;
  meta?: Record<string, unknown>;
};

type GrantResult =
  | { ok: true; xpGranted: number; energyGranted: number }
  | { ok: false; status: number; code: string; message: string };

export const grantMissionRewards = async ({
  supabase,
  userId,
  xp = 0,
  energy = 0,
  energyCap = null,
  source = 'mission.complete',
  idempotencyKey,
  meta
}: GrantArgs): Promise<GrantResult> => {
  const xpAmount = Number.isFinite(xp) ? Math.max(0, Math.floor(xp as number)) : 0;
  const energyAmount = Number.isFinite(energy) ? Math.max(0, Math.floor(energy as number)) : 0;
  const cap = Number.isFinite(energyCap) ? Math.max(0, Math.floor(energyCap as number)) : null;

  try {
    const result = await grant(
      userId,
      source,
      { xp: xpAmount, energy: energyAmount, ...(cap !== null ? { energyCap: cap } : {}) },
      meta ?? {},
      idempotencyKey,
      supabase
    );
    if (!result.ok) {
      return { ok: false, status: 500, code: 'reward_grant_failed', message: 'Unable to grant mission rewards.' };
    }
    return {
      ok: true,
      xpGranted: result.amountsApplied?.xp ?? xpAmount,
      energyGranted: result.amountsApplied?.energy ?? 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to grant mission rewards.';
    const code = message.toLowerCase().includes('xp') ? 'xp_grant_failed' : 'energy_grant_failed';
    return { ok: false, status: 500, code, message: 'Unable to grant mission rewards.' };
  }
};
