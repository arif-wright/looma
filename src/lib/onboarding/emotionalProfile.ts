import {
  EMOTIONAL_DIMENSIONS,
  ONBOARDING_QUIZ_VERSION,
  archetypeToDefaultSeed,
  canonicalArchetypes,
  type ArchetypeScores,
  type CanonicalArchetypeId,
  type EmotionalDimension,
  type EmotionalProfile
} from './archetypes';

type Choice = 'A' | 'B';
type DimensionWeights = Partial<Record<EmotionalDimension, number>>;

export type OnboardingQuizQuestion = {
  id: string;
  prompt: string;
  impacts: Record<Choice, DimensionWeights>;
};

export type OnboardingAnswer = {
  id: string;
  choice: Choice;
};

export type EmotionalProfileResult = {
  emotionalProfile: EmotionalProfile;
  archetypeScores: ArchetypeScores;
  primaryArchetype: CanonicalArchetypeId;
  secondaryArchetype: CanonicalArchetypeId;
  companionSeed: string;
  quizVersion: typeof ONBOARDING_QUIZ_VERSION;
};

export const ONBOARDING_QUESTIONS: OnboardingQuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'A quiet recharge beats a crowded victory lap.',
    impacts: {
      A: { reflection_orientation: 1, memory_affinity: 0.75, gentle_reinforcement_response: 0.9, social_energy: 0.1 },
      B: { social_energy: 1, playful_activation: 0.75, novelty_seeking: 0.65 }
    }
  },
  {
    id: 'q2',
    prompt: 'You would rather explore than follow a checklist.',
    impacts: {
      A: { novelty_seeking: 1, playful_activation: 0.8, emotional_openness: 0.55 },
      B: { stability_preference: 0.9, ritual_affinity: 0.85, reassurance_need: 0.55 }
    }
  },
  {
    id: 'q3',
    prompt: 'You decide with heart as much as head.',
    impacts: {
      A: { emotional_openness: 1, gentle_reinforcement_response: 0.75, reflection_orientation: 0.6 },
      B: { stability_preference: 0.65, reassurance_need: 0.5 }
    }
  },
  {
    id: 'q4',
    prompt: 'You prefer clarity and routine to surprises.',
    impacts: {
      A: { stability_preference: 1, ritual_affinity: 0.85, reassurance_need: 0.9 },
      B: { novelty_seeking: 0.9, playful_activation: 0.55, social_energy: 0.45 }
    }
  },
  {
    id: 'q5',
    prompt: 'You seek patterns, not just facts.',
    impacts: {
      A: { memory_affinity: 1, reflection_orientation: 0.9, emotional_openness: 0.65 },
      B: { stability_preference: 0.45, ritual_affinity: 0.35 }
    }
  },
  {
    id: 'q6',
    prompt: 'You like to keep things organized.',
    impacts: {
      A: { ritual_affinity: 1, stability_preference: 0.8, reassurance_need: 0.45 },
      B: { novelty_seeking: 0.7, playful_activation: 0.75 }
    }
  },
  {
    id: 'q7',
    prompt: 'People lean on you for support.',
    impacts: {
      A: { reassurance_need: 0.85, emotional_openness: 0.65, social_energy: 0.55 },
      B: { reflection_orientation: 0.65, memory_affinity: 0.55, gentle_reinforcement_response: 0.45 }
    }
  },
  {
    id: 'q8',
    prompt: 'You get a spark from learning new tricks.',
    impacts: {
      A: { novelty_seeking: 1, playful_activation: 1, social_energy: 0.45 },
      B: { stability_preference: 0.6, ritual_affinity: 0.55, gentle_reinforcement_response: 0.45 }
    }
  },
  {
    id: 'q9',
    prompt: 'You calm a room without saying much.',
    impacts: {
      A: { stability_preference: 0.75, gentle_reinforcement_response: 1, reflection_orientation: 0.7 },
      B: { social_energy: 0.85, playful_activation: 0.65 }
    }
  },
  {
    id: 'q10',
    prompt: 'You enjoy finishing things as much as starting them.',
    impacts: {
      A: { ritual_affinity: 0.9, stability_preference: 0.75, gentle_reinforcement_response: 0.55 },
      B: { novelty_seeking: 0.75, playful_activation: 0.7 }
    }
  }
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const scoreArchetype = (profile: EmotionalProfile, weights: DimensionWeights) => {
  const entries = Object.entries(weights) as Array<[EmotionalDimension, number]>;
  const weightSum = entries.reduce((sum, [, weight]) => sum + Math.abs(weight), 0);
  if (weightSum <= 0) return 0;
  const raw = entries.reduce((sum, [dimension, weight]) => sum + profile[dimension] * weight, 0) / weightSum;
  return Number(clamp01(raw).toFixed(3));
};

const rankArchetypes = (scores: ArchetypeScores) =>
  (Object.entries(scores) as Array<[CanonicalArchetypeId, number]>).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

export const calculateEmotionalProfileResult = (answers: OnboardingAnswer[]): EmotionalProfileResult => {
  const answerById = new Map(answers.map((answer) => [answer.id, answer.choice] as const));
  const totals = Object.fromEntries(EMOTIONAL_DIMENSIONS.map((dimension) => [dimension, 0])) as EmotionalProfile;
  const weights = Object.fromEntries(EMOTIONAL_DIMENSIONS.map((dimension) => [dimension, 0])) as EmotionalProfile;

  for (const question of ONBOARDING_QUESTIONS) {
    const choice = answerById.get(question.id);
    if (choice !== 'A' && choice !== 'B') continue;
    const impacts = question.impacts[choice];
    for (const [dimension, value] of Object.entries(impacts) as Array<[EmotionalDimension, number]>) {
      totals[dimension] += value;
      weights[dimension] += 1;
    }
  }

  const emotionalProfile = Object.fromEntries(
    EMOTIONAL_DIMENSIONS.map((dimension) => [
      dimension,
      Number((weights[dimension] > 0 ? clamp01(totals[dimension] / weights[dimension]) : 0.5).toFixed(3))
    ])
  ) as EmotionalProfile;

  const archetypeScores: ArchetypeScores = {
    muse: scoreArchetype(emotionalProfile, {
      emotional_openness: 1,
      reflection_orientation: 1,
      gentle_reinforcement_response: 0.85
    }),
    guardian: scoreArchetype(emotionalProfile, {
      stability_preference: 1,
      reassurance_need: 1,
      ritual_affinity: 0.85
    }),
    spark: scoreArchetype(emotionalProfile, {
      novelty_seeking: 1,
      playful_activation: 1,
      social_energy: 0.8
    }),
    root: scoreArchetype(emotionalProfile, {
      stability_preference: 0.9,
      ritual_affinity: 1,
      gentle_reinforcement_response: 0.9
    }),
    echo: scoreArchetype(emotionalProfile, {
      memory_affinity: 1,
      reflection_orientation: 1,
      emotional_openness: 0.85
    })
  };

  const ranked = rankArchetypes(archetypeScores);
  const primaryArchetype = ranked[0]?.[0] ?? 'muse';
  const secondaryArchetype = ranked.find(([id]) => id !== primaryArchetype)?.[0] ?? 'guardian';

  return {
    emotionalProfile,
    archetypeScores,
    primaryArchetype,
    secondaryArchetype,
    companionSeed: archetypeToDefaultSeed[primaryArchetype],
    quizVersion: ONBOARDING_QUIZ_VERSION
  };
};

export const buildPersonaSummary = (result: EmotionalProfileResult) => {
  const primary = canonicalArchetypes[result.primaryArchetype];
  const secondary = canonicalArchetypes[result.secondaryArchetype];
  return {
    archetype: result.primaryArchetype,
    displayName: primary.displayName,
    secondaryArchetype: result.secondaryArchetype,
    secondaryDisplayName: secondary.displayName,
    companionSeed: result.companionSeed,
    emotionalFunction: primary.emotionalFunction,
    emotionalProfile: result.emotionalProfile,
    archetypeScores: result.archetypeScores,
    onboardingQuizVersion: result.quizVersion,
    resultCopy: primary.resultCopy,
    suggestedFirstRitual: primary.suggestedFirstRitual
  };
};
