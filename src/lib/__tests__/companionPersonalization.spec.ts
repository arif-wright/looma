import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { EMOTIONAL_DIMENSIONS, ONBOARDING_QUIZ_VERSION } from '$lib/onboarding/archetypes';
import { deriveCompanionPersonalization, personalizeReconnectFallback, toPublicPersona } from '$lib/companions/personalization';
import { getCompanionPersonalization } from '$lib/server/companionPersonalization';
import { buildCompanionPromptContext } from '$lib/server/llm/companionText';
import type { AgentEvent } from '$lib/agents/types';

const preferences = { consent_adaptation: true, consent_emotional_adaptation: true };
const traits = (exploratory = false) => ({
  consent: true,
  onboarding_quiz_version: ONBOARDING_QUIZ_VERSION,
  emotional_profile: {
    ...Object.fromEntries(EMOTIONAL_DIMENSIONS.map(key => [key, 0.5])),
    stability_preference: exploratory ? 0.2 : 0.9,
    ritual_affinity: exploratory ? 0.2 : 0.9,
    novelty_seeking: exploratory ? 0.9 : 0.2,
    playful_activation: exploratory ? 0.9 : 0.2
  }
});

describe('companion personalization', () => {
  it('changes guidance for the same Muse, mood and reflection without changing identity or history', () => {
    const event: AgentEvent = {
      id: 'check-in', type: 'companion.ritual.listen', scope: 'companion', timestamp: '2026-09-07T12:00:00Z',
      payload: { companionName: 'Muse', companionArchetype: 'muse', mood: 'calm', reflection: 'It has been a peaceful afternoon.' }
    };
    const results = [false, true].map(exploratory => buildCompanionPromptContext({
      event, intensity: 'light', context: { personalization: deriveCompanionPersonalization(traits(exploratory), preferences) }
    }));
    expect(results[0]!.personalizationGuidance).toContain('one clear, small next step');
    expect(results[1]!.personalizationGuidance).toContain('open-ended exploration');
    const { personalizationGuidance: first, ...rest1 } = results[0]!;
    const { personalizationGuidance: second, ...rest2 } = results[1]!;
    expect(rest1).toEqual(rest2);
    expect(rest1.companionArchetype).toBe('muse');
    expect(JSON.stringify(results)).not.toContain('reassurance_need');
    const suppressed = buildCompanionPromptContext({
      event: { ...event, meta: { suppressAdaptation: true } }, intensity: 'light',
      context: { personalization: deriveCompanionPersonalization(traits(), preferences) }
    });
    expect(suppressed.personalizationGuidance).toBeNull();
  });

  it('keeps requests at the end of the reflection available to the model', () => {
    const reflection = 'Today was peaceful and I spent some time thinking about the garden and the things we might make together when the weather changes. Please just listen today.';
    const event: AgentEvent = { id: 'request', type: 'companion.ritual.listen', scope: 'companion', timestamp: '2026-09-07T12:00:00Z', payload: { reflection } };
    const context = buildCompanionPromptContext({ event, intensity: 'light', context: {} });
    expect(context.currentReflection).toBe(reflection);
    expect(context.reflectionExcerpt).not.toContain('Please just listen today.');
  });

  it('offers different optional continuations without a model call', () => {
    const text = 'Thank you for sharing this moment with me.';
    const structured = deriveCompanionPersonalization(traits(), preferences);
    const exploratory = deriveCompanionPersonalization(traits(true), preferences);
    expect(personalizeReconnectFallback(text, structured, 'calm', 'A peaceful afternoon.')).toContain('one small next step');
    expect(personalizeReconnectFallback(text, exploratory, 'calm', 'A peaceful afternoon.')).toContain('explore an idea');
    expect(personalizeReconnectFallback(text, null, 'calm', 'A peaceful afternoon.')).toBe(text);
    for (const reflection of ['Please just listen.', 'I want to explore.', "Don't suggest an activity.", 'Can you stay here?']) {
      expect(personalizeReconnectFallback(text, structured, 'calm', reflection)).toBe(text);
    }
    for (const mood of ['heavy', 'numb']) expect(personalizeReconnectFallback(text, exploratory, mood, 'A difficult day.')).toBe(text);
  });

  it('is neutral for each disabled permission, absent data, reset data and unknown versions', () => {
    expect(deriveCompanionPersonalization({ ...traits(), consent: false }, preferences)).toBeNull();
    for (const key of Object.keys(preferences)) {
      expect(deriveCompanionPersonalization(traits(), { ...preferences, [key]: false })).toBeNull();
    }
    expect(deriveCompanionPersonalization(traits(), {})).toBeNull();
    expect(deriveCompanionPersonalization(null, preferences)).toBeNull();
    expect(deriveCompanionPersonalization({ ...traits(), emotional_profile: null }, preferences)).toBeNull();
    expect(deriveCompanionPersonalization({ ...traits(), onboarding_quiz_version: 'future' }, preferences)).toBeNull();
  });

  it('rejects incomplete, nonnumeric, out-of-range or ambiguous profiles', () => {
    for (const value of [undefined, '0.9', NaN, Infinity, -1, 2]) {
      expect(deriveCompanionPersonalization({ ...traits(), emotional_profile: { ...traits().emotional_profile, social_energy: value } }, preferences)).toBeNull();
    }
    expect(deriveCompanionPersonalization({ ...traits(), emotional_profile: Object.fromEntries(EMOTIONAL_DIMENSIONS.map(key => [key, 0.5])) }, preferences)).toBeNull();
  });

  it('serializes only existing public badge fields, including when future private fields are added', () => {
    const summary = { archetype: 'muse', color: '#abcdef', emotionalProfile: traits().emotional_profile, archetypeScores: { muse: 0.9 }, raw: ['private'], futureSensitiveField: 'private' };
    expect(JSON.parse(JSON.stringify(toPublicPersona(summary)))).toEqual({ archetype: 'muse', color: '#abcdef' });
    expect(toPublicPersona(null)).toBeNull();
    expect(toPublicPersona({ archetype: {}, color: 'url(private)' })).toEqual({ archetype: null, color: null });
  });
});

describe('owner-scoped personalization lookup', () => {
  const request = (failure: 'error' | 'throw' | null = null) => {
    const eq = vi.fn().mockReturnThis();
    const db = { from: vi.fn() };
    db.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockImplementation(() => chain),
        eq: vi.fn().mockImplementation((...args) => { eq(...args); return chain; }),
        maybeSingle: vi.fn(async () => {
          if (failure === 'throw') throw new Error('unavailable');
          return { error: failure === 'error' ? { code: 'PGRST204' } : null, data: table === 'player_traits' ? traits() : preferences };
        })
      };
      return chain;
    });
    return { event: { locals: { user: { id: 'owner' }, supabase: db } } as unknown as RequestEvent, db, eq };
  };

  it('uses the signed-in user for both reads and queries again after permission changes', async () => {
    const { event, eq, db } = request();
    expect((await getCompanionPersonalization(event))?.pacing).toBe('structured');
    expect(eq.mock.calls).toEqual([['user_id', 'owner'], ['user_id', 'owner']]);
    db.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) as any);
    expect(await getCompanionPersonalization(event)).toBeNull();
  });

  it('remains neutral for anonymous requests and failed storage', async () => {
    const { event, db } = request();
    event.locals.user = null;
    expect(await getCompanionPersonalization(event)).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
    for (const failure of ['error', 'throw'] as const) expect(await getCompanionPersonalization(request(failure).event)).toBeNull();
  });
});
