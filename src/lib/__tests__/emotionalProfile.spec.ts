import { describe, expect, it, vi } from 'vitest';
import { canonicalArchetypes, EMOTIONAL_DIMENSIONS, resolveCanonicalArchetypeId } from '$lib/onboarding/archetypes';
import {
  calculateEmotionalProfileResult,
  ONBOARDING_QUESTIONS,
  type OnboardingAnswer
} from '$lib/onboarding/emotionalProfile';

const answersFromChoices = (choices: Array<'A' | 'B'>): OnboardingAnswer[] =>
  ONBOARDING_QUESTIONS.map((question, index) => ({
    id: question.id,
    choice: choices[index] ?? 'A'
  }));

describe('emotional onboarding profile scoring', () => {
  it('keeps emotional profile values normalized for every answer path', () => {
    const paths = [
      answersFromChoices(Array(10).fill('A') as Array<'A'>),
      answersFromChoices(Array(10).fill('B') as Array<'B'>),
      answersFromChoices(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'])
    ];

    for (const answers of paths) {
      const result = calculateEmotionalProfileResult(answers);
      expect(canonicalArchetypes[result.primaryArchetype]).toBeTruthy();
      expect(canonicalArchetypes[result.primaryArchetype].resultCopy).toBeTruthy();
      for (const dimension of EMOTIONAL_DIMENSIONS) {
        expect(typeof result.emotionalProfile[dimension]).toBe('number');
        expect(result.emotionalProfile[dimension]).toBeGreaterThanOrEqual(0);
        expect(result.emotionalProfile[dimension]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('can return Root from a steady ritual answer pattern', () => {
    const result = calculateEmotionalProfileResult(
      answersFromChoices(['A', 'B', 'B', 'A', 'B', 'A', 'B', 'B', 'A', 'A'])
    );
    expect(result.primaryArchetype).toBe('root');
    expect(result.companionSeed).toBe('kynth');
  });

  it('can return Echo from a reflective memory answer pattern', () => {
    const result = calculateEmotionalProfileResult(
      answersFromChoices(['A', 'B', 'A', 'B', 'A', 'A', 'B', 'B', 'A', 'A'])
    );
    expect(result.primaryArchetype).toBe('echo');
    expect(result.companionSeed).toBe('nira');
  });

  it('maps old labels and unknown keys safely', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveCanonicalArchetypeId('harmonizer')).toBe('muse');
    expect(resolveCanonicalArchetypeId('sentinel')).toBe('guardian');
    expect(resolveCanonicalArchetypeId('something-new')).toBe('muse');
    warn.mockRestore();
  });
});
