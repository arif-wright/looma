import type { SupabaseClient } from '@supabase/supabase-js';
import { spend as spendTransaction } from '$lib/server/economy/transactions';

type SpendArgs = {
  supabase: SupabaseClient;
  userId: string;
  energy: number;
  source?: string;
  idempotencyKey?: string;
  meta?: Record<string, unknown>;
};

type SpendResult =
  | { ok: true; energySpent: number }
  | { ok: false; status: number; code: string; message: string };

// Mission energy spend helper used by action missions.
export const spend = async ({
  supabase,
  userId,
  energy,
  source = 'mission.start',
  idempotencyKey,
  meta
}: SpendArgs): Promise<SpendResult> => {
  const cost = Number.isFinite(energy) ? Math.max(0, Math.floor(energy)) : 0;
  if (cost === 0) return { ok: true, energySpent: 0 };

  try {
    const result = await spendTransaction(
      userId,
      source,
      { energy: cost },
      meta ?? {},
      idempotencyKey,
      supabase
    );
    if (!result.ok) {
      return {
        ok: false,
        status: 500,
        code: 'energy_spend_failed',
        message: 'Unable to spend mission energy.'
      };
    }
    const spent = result.amountsApplied?.energy ?? 0;
    if (spent < cost) {
      return {
        ok: false,
        status: 409,
        code: 'insufficient_energy',
        message: 'Not enough energy to start this mission.'
      };
    }
    return { ok: true, energySpent: spent };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: 'energy_spend_failed',
      message: 'Unable to spend mission energy.'
    };
  }
};
