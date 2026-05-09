import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const { data: traits } = await supabase
    .from('player_traits')
    .select('consent')
    .eq('user_id', userId)
    .maybeSingle();

  const consent = traits?.consent ?? true;

  let upsertError = (await supabase.from('player_traits').upsert({
    user_id: userId,
    raw: null,
    facets: null,
    archetype: null,
    emotional_profile: null,
    primary_archetype: null,
    secondary_archetype: null,
    companion_seed: null,
    archetype_scores: null,
    onboarding_quiz_version: null,
    consent,
    updated_at: new Date().toISOString()
  })).error;

  if (upsertError?.code === 'PGRST204' || upsertError?.message?.includes('emotional_profile')) {
    upsertError = (await supabase.from('player_traits').upsert({
      user_id: userId,
      raw: null,
      facets: null,
      archetype: null,
      consent,
      updated_at: new Date().toISOString()
    })).error;
  }

  if (upsertError) {
    console.error('[persona/reset] upsert failed', upsertError);
    return json({ error: 'unable_to_reset' }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from('persona_profiles')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error('[persona/reset] remove summary failed', deleteError);
    return json({ error: 'unable_to_reset' }, { status: 500 });
  }

  return json({ ok: true });
};
