import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  buildPersonaSummary,
  calculateEmotionalProfileResult,
  type OnboardingAnswer
} from '$lib/onboarding/emotionalProfile';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const answers = (payload as { answers?: unknown; consent?: unknown })?.answers;
  const consentRaw = (payload as { consent?: unknown })?.consent;
  const consent =
    typeof consentRaw === 'boolean'
      ? consentRaw
      : typeof consentRaw === 'string'
        ? consentRaw === 'true'
        : undefined;
  if (!Array.isArray(answers)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const normalizedAnswers: OnboardingAnswer[] = answers
    .map((answer) => {
      const raw = answer as { id?: unknown; choice?: unknown };
      if (typeof raw.id !== 'string') return null;
      if (raw.choice !== 'A' && raw.choice !== 'B') return null;
      return { id: raw.id, choice: raw.choice };
    })
    .filter((answer): answer is OnboardingAnswer => Boolean(answer));

  const result = calculateEmotionalProfileResult(normalizedAnswers);
  const summary = buildPersonaSummary(result);
  const userId = session.user.id;
  const consentValue = typeof consent === 'boolean' ? consent : true;

  const fullTraitsPayload = {
    user_id: userId,
    raw: normalizedAnswers,
    facets: result.emotionalProfile,
    archetype: result.primaryArchetype,
    consent: consentValue,
    emotional_profile: result.emotionalProfile,
    primary_archetype: result.primaryArchetype,
    secondary_archetype: result.secondaryArchetype,
    companion_seed: result.companionSeed,
    archetype_scores: result.archetypeScores,
    onboarding_quiz_version: result.quizVersion,
    updated_at: new Date().toISOString()
  };

  let traitsError = (await supabase.from('player_traits').upsert(fullTraitsPayload)).error;
  if (traitsError?.code === 'PGRST204' || traitsError?.message?.includes('emotional_profile')) {
    const { error } = await supabase.from('player_traits').upsert({
      user_id: userId,
      raw: normalizedAnswers,
      facets: result.emotionalProfile,
      archetype: result.primaryArchetype,
      consent: consentValue,
      updated_at: new Date().toISOString()
    });
    traitsError = error;
  }

  if (traitsError) {
    return json({ error: traitsError.message }, { status: 400 });
  }

  const { error: summaryError } = await supabase.from('persona_profiles').upsert({
    user_id: userId,
    summary,
    updated_at: new Date().toISOString()
  });

  if (summaryError) {
    return json({ error: summaryError.message }, { status: 400 });
  }

  return json({
    ok: true,
    archetype: result.primaryArchetype,
    emotionalProfile: result.emotionalProfile,
    archetypeScores: result.archetypeScores,
    primaryArchetype: result.primaryArchetype,
    secondaryArchetype: result.secondaryArchetype,
    companionSeed: result.companionSeed,
    onboardingQuizVersion: result.quizVersion,
    summary
  });
};
