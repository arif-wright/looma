import type { RequestEvent } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { getActiveCompanionBond } from '$lib/server/companions/bonds';
import { getConsentFlags } from '$lib/server/consent';
import {
  CONTEXT_BUNDLE_VERSION,
  type ContextBundle,
  type PortableStateBundle
} from '$lib/types/contextBundle';

export type ContextBundleArgs = {
  userId?: string | null;
  sessionId?: string | null;
};

const normalizeSeason = (month: number): 'spring' | 'summer' | 'autumn' | 'winter' => {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 8) return 'summer';
  if (month >= 9 && month <= 10) return 'autumn';
  return 'winter';
};

const normalizeAccent = (month: number): 'amber' | 'neonMagenta' | 'neonCyan' => {
  if (month >= 5 && month <= 8) return 'amber';
  if (month >= 9 || month <= 1) return 'neonMagenta';
  return 'neonCyan';
};

const sanitizePortablePayload = (input: unknown): PortableStateBundle['lastContextPayload'] => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const payload = input as Record<string, unknown>;
  const entries = Object.entries(payload).slice(0, 20);
  const output: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of entries) {
    if (value == null) {
      output[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else {
      output[key] = null;
    }
  }

  return output;
};

const extractPortableState = (portableState: unknown) => {
  if (!portableState || typeof portableState !== 'object' || Array.isArray(portableState)) {
    return { tone: null as string | null, reactionsEnabled: null as boolean | null };
  }

  const payload = portableState as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  let tone: string | null = null;
  let reactionsEnabled: boolean | null = null;

  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (key === 'tone' && typeof entry.value === 'string') {
      tone = entry.value;
    }
    if ((key === 'reactions_enabled' || key === 'reactionsEnabled') && typeof entry.value === 'boolean') {
      reactionsEnabled = entry.value;
    }
  }

  return { tone, reactionsEnabled };
};

export const getContextBundle = async (event: RequestEvent, args: ContextBundleArgs = {}): Promise<ContextBundle> => {
  const { supabase, session } = await createSupabaseServerClient(event);
  const resolvedUserId = args.userId ?? session?.user?.id ?? null;
  const now = new Date();
  const month = now.getMonth();

  if (!resolvedUserId) {
    return {
      version: CONTEXT_BUNDLE_VERSION,
      generatedAt: now.toISOString(),
      playerState: {
        id: 'anonymous',
        level: null,
        xp: null,
        xpNext: null,
        energy: null,
        energyMax: null,
        currency: 0,
        walletUpdatedAt: null
      },
      companionState: {
        activeCompanionId: null,
        name: null,
        bondLevel: null,
        bondScore: null,
        xpMultiplier: null,
        state: null,
        mood: null
      },
      worldState: {
        serverTime: now.toISOString(),
        season: normalizeSeason(month),
        themeAccent: normalizeAccent(month)
      },
      portableState: {
        tone: null,
        reactionsEnabled: null,
        lastContext: { context: null, trigger: null },
        lastContextPayload: {}
      }
    };
  }

  const [stats, walletRes, companionBond, prefsRes, companionRes, consentFlags] = await Promise.all([
    getPlayerStats(event, supabase),
    supabase
      .from('user_wallets')
      .select('shards, updated_at')
      .eq('user_id', resolvedUserId)
      .maybeSingle(),
    getActiveCompanionBond(resolvedUserId, supabase),
    supabase
      .from('user_preferences')
      .select('last_context, last_context_payload, portable_state')
      .eq('user_id', resolvedUserId)
      .maybeSingle(),
    supabase
      .from('companions')
      .select('state, mood')
      .eq('owner_id', resolvedUserId)
      .order('is_active', { ascending: false })
      .order('state', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getConsentFlags(event, supabase)
  ]);

  if (walletRes.error && walletRes.error.code !== 'PGRST116') {
    console.error('[context bundle] wallet query failed', walletRes.error);
  }

  if (prefsRes.error && prefsRes.error.code !== 'PGRST116') {
    console.error('[context bundle] user preferences query failed', prefsRes.error);
  }

  if (companionRes.error && companionRes.error.code !== 'PGRST116') {
    console.error('[context bundle] companion state query failed', companionRes.error);
  }

  const lastContext =
    prefsRes.data && typeof prefsRes.data.last_context === 'object' && prefsRes.data.last_context !== null
      ? (prefsRes.data.last_context as Record<string, unknown>)
      : null;
  const portableExtracted = extractPortableState(prefsRes.data?.portable_state);

  return {
    version: CONTEXT_BUNDLE_VERSION,
    generatedAt: now.toISOString(),
    playerState: {
      id: resolvedUserId,
      level: stats?.level ?? null,
      xp: stats?.xp ?? null,
      xpNext: stats?.xp_next ?? null,
      energy: stats?.energy ?? null,
      energyMax: stats?.energy_max ?? null,
      currency: Number(walletRes.data?.shards ?? 0),
      walletUpdatedAt: walletRes.data?.updated_at ?? null
    },
    companionState: {
      activeCompanionId: companionBond?.companionId ?? null,
      name: companionBond?.name ?? null,
      bondLevel: companionBond?.level ?? null,
      bondScore: companionBond?.score ?? null,
      xpMultiplier: companionBond?.bonus?.xpMultiplier ?? null,
      state: typeof companionRes.data?.state === 'string' ? companionRes.data.state : null,
      mood: typeof companionRes.data?.mood === 'string' ? companionRes.data.mood : null
    },
    worldState: {
      serverTime: now.toISOString(),
      season: normalizeSeason(month),
      themeAccent: normalizeAccent(month)
    },
    portableState: {
      tone: portableExtracted.tone,
      reactionsEnabled: consentFlags.reactions,
      lastContext: {
        context:
          consentFlags.adaptation && typeof lastContext?.context === 'string'
            ? (lastContext.context as string)
            : null,
        trigger:
          consentFlags.adaptation && typeof lastContext?.trigger === 'string'
            ? (lastContext.trigger as string)
            : null
      },
      lastContextPayload: consentFlags.memory
        ? sanitizePortablePayload(prefsRes.data?.last_context_payload)
        : {}
    }
  } satisfies ContextBundle;
};
