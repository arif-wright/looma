import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/server/supabase';

export type ConsentFlags = {
  memory: boolean;
  adaptation: boolean;
};

const DEFAULT_CONSENT: ConsentFlags = {
  memory: true,
  adaptation: true
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
    .select('consent_memory, consent_adaptation')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[consent] fetch failed', error);
  }

  return {
    memory: typeof data?.consent_memory === 'boolean' ? data.consent_memory : DEFAULT_CONSENT.memory,
    adaptation:
      typeof data?.consent_adaptation === 'boolean' ? data.consent_adaptation : DEFAULT_CONSENT.adaptation
  };
};
