import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getConsentFlags } from '$lib/server/consent';

const findCompanionId = async (userId: string, supabase: App.Locals['supabase'], requestedId?: string | null) => {
  if (requestedId && requestedId.trim().length > 0) return requestedId.trim();
  const { data, error } = await supabase
    .from('companions')
    .select('id')
    .eq('owner_id', userId)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('[ambient] active companion lookup failed', error);
  }
  return typeof data?.id === 'string' ? data.id : null;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const requestedId = event.url.searchParams.get('companionId');
  const companionId = await findCompanionId(session.user.id, supabase, requestedId);
  if (!companionId) {
    return json({
      companionId: null,
      consent: { emotionalAdaptation: true, crossAppContinuity: false },
      emotionalState: null,
      memorySummary: null
    });
  }

  const consent = await getConsentFlags(event, supabase);
  const [emotionalRes, summaryRes] = await Promise.all([
    supabase
      .from('companion_emotional_state')
      .select('mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at, updated_at')
      .eq('user_id', session.user.id)
      .eq('companion_id', companionId)
      .maybeSingle(),
    supabase
      .from('companion_memory_summary')
      .select('summary_text, highlights_json, last_built_at')
      .eq('user_id', session.user.id)
      .eq('companion_id', companionId)
      .maybeSingle()
  ]);

  if (emotionalRes.error && emotionalRes.error.code !== 'PGRST116') {
    console.error('[ambient] emotional state lookup failed', emotionalRes.error);
  }
  if (summaryRes.error && summaryRes.error.code !== 'PGRST116') {
    console.error('[ambient] memory summary lookup failed', summaryRes.error);
  }

  return json({
    companionId,
    consent: {
      emotionalAdaptation: consent.emotionalAdaptation,
      crossAppContinuity: consent.crossAppContinuity
    },
    emotionalState: emotionalRes.data ?? null,
    memorySummary: summaryRes.data ?? null
  });
};
