import type { RequestEvent } from '@sveltejs/kit';
import { deriveCompanionPersonalization, type CompanionPersonalization } from '$lib/companions/personalization';

export const getCompanionPersonalization = async (event: RequestEvent): Promise<CompanionPersonalization | null> => {
  // The authenticated request owns this lookup; no caller-supplied target user ID.
  const userId = event.locals.user?.id ?? event.locals.session?.user?.id;
  const db = event.locals.supabase;
  if (!userId || !db) return null;
  try {
    const [traits, preferences] = await Promise.all([
      db.from('player_traits').select('consent, emotional_profile, onboarding_quiz_version').eq('user_id', userId).maybeSingle(),
      db.from('user_preferences').select('consent_adaptation, consent_emotional_adaptation').eq('user_id', userId).maybeSingle()
    ]);
    if (traits.error || preferences.error) return null;
    return deriveCompanionPersonalization(traits.data, preferences.data);
  } catch {
    // Missing columns, reset profiles and unavailable storage remain neutral.
    return null;
  }
};
