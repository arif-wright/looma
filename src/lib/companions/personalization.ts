import { EMOTIONAL_DIMENSIONS, ONBOARDING_QUIZ_VERSION } from '$lib/onboarding/archetypes';

export type CompanionPersonalization = {
  source: 'onboarding';
  version: typeof ONBOARDING_QUIZ_VERSION;
  pacing: 'structured' | 'exploratory';
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

// Only a bounded preference reaches the response layer, never the raw quiz or scores.
export const deriveCompanionPersonalization = (traits: unknown, preferences: unknown): CompanionPersonalization | null => {
  const row = record(traits);
  const prefs = record(preferences);
  if (row?.consent !== true || prefs?.consent_adaptation !== true || prefs?.consent_emotional_adaptation !== true) return null;
  if (row.onboarding_quiz_version !== ONBOARDING_QUIZ_VERSION) return null;
  const profile = record(row.emotional_profile);
  if (!profile || !EMOTIONAL_DIMENSIONS.every((key) =>
    typeof profile[key] === 'number' && Number.isFinite(profile[key]) && Number(profile[key]) >= 0 && Number(profile[key]) <= 1
  )) return null;
  const structure = (Number(profile.stability_preference) + Number(profile.ritual_affinity)) / 2;
  const exploration = (Number(profile.novelty_seeking) + Number(profile.playful_activation)) / 2;
  // Close results are ambiguous. No personality label or diagnostic inference is made.
  if (Math.abs(structure - exploration) < 0.15) return null;
  return { source: 'onboarding', version: ONBOARDING_QUIZ_VERSION, pacing: structure > exploration ? 'structured' : 'exploratory' };
};

export const readCompanionPersonalization = (value: unknown): CompanionPersonalization | null => {
  const data = record(value);
  if (data?.source !== 'onboarding' || data.version !== ONBOARDING_QUIZ_VERSION ||
    (data.pacing !== 'structured' && data.pacing !== 'exploratory')) return null;
  return { source: 'onboarding', version: ONBOARDING_QUIZ_VERSION, pacing: data.pacing };
};

export const personalizationGuidance = (value: unknown): string | null => {
  const preference = readCompanionPersonalization(value);
  if (!preference) return null;
  return preference.pacing === 'structured'
    ? 'Tentative onboarding preference: offer at most one clear, small next step, only if wanted.'
    : 'Tentative onboarding preference: leave room for curiosity and an optional open-ended exploration.';
};

// Used only on non-LLM reconnect replies. Avoid proposals in distress or where the
// user appears to be asking for something specific; natural-language intent is uncertain.
export const personalizeReconnectFallback = (text: string, value: unknown, mood: string, reflection: string): string => {
  const preference = readCompanionPersonalization(value);
  if (!preference || mood === 'heavy' || mood === 'numb' ||
    /[?？]|\b(please|want|need|prefer|rather|only|just|don't|do not|stop|no|not|can you|could you|let's|let us)\b/i.test(reflection)) return text;
  return `${text} ${preference.pacing === 'structured'
    ? 'Would you like to choose one small next step together?'
    : 'Would you like to explore an idea together and see where it leads?'}`;
};

export const toPublicPersona = (value: unknown): { archetype: string | null; color: string | null } | null => {
  const data = record(value);
  if (!data) return null;
  // These are the only fields consumed by the existing public profile badge.
  const archetype = typeof data.archetype === 'string' && /^[a-z][a-z0-9_-]{0,39}$/i.test(data.archetype) ? data.archetype : null;
  const color = typeof data.color === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(data.color) ? data.color : null;
  return { archetype, color };
};
