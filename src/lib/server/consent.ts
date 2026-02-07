import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/server/supabase';

export type ConsentFlags = {
  memory: boolean;
  adaptation: boolean;
  reactions: boolean;
};

const DEFAULT_CONSENT: ConsentFlags = {
  memory: true,
  adaptation: true,
  reactions: true
};

const extractPortableReactions = (portableState: unknown): boolean | null => {
  if (!portableState || typeof portableState !== 'object' || Array.isArray(portableState)) return null;
  const payload = portableState as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const key = typeof entry.key === 'string' ? entry.key : '';
    if ((key === 'reactions_enabled' || key === 'reactionsEnabled') && typeof entry.value === 'boolean') {
      return entry.value;
    }
  }
  return null;
};

const isMissingReactionsColumn = (error: { code?: string | null; message?: string | null } | null | undefined) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return typeof error.message === 'string' && error.message.includes('consent_reactions');
};

export const getConsentFlags = async (
  event: RequestEvent,
  client?: SupabaseClient
): Promise<ConsentFlags> => {
  const supabase = client ?? (await createSupabaseServerClient(event)).supabase;
  const userId = event.locals.user?.id;
  if (!userId) return { ...DEFAULT_CONSENT };

  const { data, error } = await supabase
    .from('user_preferences')
    .select('consent_memory, consent_adaptation, consent_reactions')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116' && !isMissingReactionsColumn(error)) {
    console.error('[consent] fetch failed', error);
  }

  if (isMissingReactionsColumn(error)) {
    const fallback = await supabase
      .from('user_preferences')
      .select('consent_memory, consent_adaptation, portable_state')
      .eq('user_id', userId)
      .maybeSingle();
    const portableReactions = extractPortableReactions(fallback.data?.portable_state);

    if (fallback.error && fallback.error.code !== 'PGRST116') {
      console.error('[consent] fallback fetch failed', fallback.error);
    }

    return {
      memory:
        typeof fallback.data?.consent_memory === 'boolean' ? fallback.data.consent_memory : DEFAULT_CONSENT.memory,
      adaptation:
        typeof fallback.data?.consent_adaptation === 'boolean'
          ? fallback.data.consent_adaptation
          : DEFAULT_CONSENT.adaptation,
      reactions: typeof portableReactions === 'boolean' ? portableReactions : DEFAULT_CONSENT.reactions
    };
  }

  return {
    memory: typeof data?.consent_memory === 'boolean' ? data.consent_memory : DEFAULT_CONSENT.memory,
    adaptation:
      typeof data?.consent_adaptation === 'boolean' ? data.consent_adaptation : DEFAULT_CONSENT.adaptation,
    reactions:
      typeof data?.consent_reactions === 'boolean' ? data.consent_reactions : DEFAULT_CONSENT.reactions
  };
};
