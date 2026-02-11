import type { SupabaseClient } from '@supabase/supabase-js';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';

export type IdentityResultPayload = {
  archetype: string;
  traits: string[];
  tone: string;
};

const clampString = (value: unknown, max = 64) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const sanitizeTraits = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const raw of value) {
    const trait = clampString(raw, 32);
    if (!trait) continue;
    unique.add(trait);
    if (unique.size >= 12) break;
  }
  return [...unique];
};

// Allowlist-only shape for identity mission outputs.
export const sanitizeIdentityResult = (input: unknown): IdentityResultPayload | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const payload = input as Record<string, unknown>;
  const archetype = clampString(payload.archetype, 48);
  const tone = clampString(payload.tone, 48);
  if (!archetype || !tone) return null;
  return {
    archetype,
    traits: sanitizeTraits(payload.traits),
    tone
  };
};

const coercePortableState = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      version: PORTABLE_STATE_VERSION,
      updatedAt: now,
      items: [],
      companions: normalizePortableCompanions(null),
      identity: null
    };
  }
  const payload = input as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? (payload.items as PortableState['items']) : [];
  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items,
    companions: normalizePortableCompanions(payload.companions),
    identity:
      payload.identity && typeof payload.identity === 'object' && !Array.isArray(payload.identity)
        ? ((payload.identity as PortableState['identity']) ?? null)
        : null
  };
};

export const writeIdentityResultToPortableState = async ({
  supabase,
  userId,
  result,
  source = 'identity_mission'
}: {
  supabase: SupabaseClient;
  userId: string;
  result: IdentityResultPayload;
  source?: string;
}) => {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('portable_state')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    return { ok: false as const, error };
  }

  const now = new Date().toISOString();
  const base = coercePortableState(data?.portable_state);
  const nextPortable: PortableState = {
    ...base,
    updatedAt: now,
    identity: {
      archetype: result.archetype,
      traits: result.traits,
      tone: result.tone,
      updatedAt: now,
      source
    }
  };

  const upsert = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        portable_state: nextPortable
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );

  if (upsert.error) {
    return { ok: false as const, error: upsert.error };
  }
  return { ok: true as const };
};
