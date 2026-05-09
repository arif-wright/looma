export const ONBOARDING_QUIZ_VERSION = 'emotional-profile-v1';

export const EMOTIONAL_DIMENSIONS = [
  'emotional_openness',
  'stability_preference',
  'novelty_seeking',
  'reflection_orientation',
  'reassurance_need',
  'social_energy',
  'ritual_affinity',
  'playful_activation',
  'memory_affinity',
  'gentle_reinforcement_response'
] as const;

export type EmotionalDimension = (typeof EMOTIONAL_DIMENSIONS)[number];
export type EmotionalProfile = Record<EmotionalDimension, number>;
export type CanonicalArchetypeId = 'muse' | 'guardian' | 'spark' | 'root' | 'echo';
export type ArchetypeScores = Record<CanonicalArchetypeId, number>;

export type CanonicalArchetypeConfig = {
  id: CanonicalArchetypeId;
  displayName: string;
  emotionalFunction: string;
  shortDescription: string;
  longDescription: string;
  companionSeed: string;
  assetKey: CanonicalArchetypeId;
  imagePath: string;
  resultHeadline: string;
  resultCopy: string;
  suggestedFirstRitual: string;
};

export const seedToArchetype: Record<string, CanonicalArchetypeId> = {
  mirae: 'muse',
  lumina: 'muse',
  tova: 'guardian',
  aurex: 'spark',
  vexel: 'spark',
  kynth: 'root',
  elar: 'root',
  nira: 'echo',
  muse: 'muse',
  guardian: 'guardian',
  spark: 'spark',
  root: 'root',
  echo: 'echo',
  harmonizer: 'muse',
  sentinel: 'guardian',
  looma: 'muse'
};

export const archetypeToDefaultSeed: Record<CanonicalArchetypeId, string> = {
  muse: 'mirae',
  guardian: 'tova',
  spark: 'aurex',
  root: 'kynth',
  echo: 'nira'
};

export const canonicalArchetypes: Record<CanonicalArchetypeId, CanonicalArchetypeConfig> = {
  muse: {
    id: 'muse',
    displayName: 'Muse',
    emotionalFunction: 'Reflection, emotional resonance, and creative expression',
    shortDescription: 'A reflective companion drawn to feeling, meaning, and gentle expression.',
    longDescription:
      'Muse meets you through resonance. This bond is tuned for emotional openness, creative reflection, and the kind of encouragement that helps a feeling become a shape you can hold.',
    companionSeed: 'mirae',
    assetKey: 'muse',
    imagePath: '/assets/muse_background.png',
    resultHeadline: 'Your companion is drawn to your reflective current.',
    resultCopy:
      'There is a listening quality in your answers: a wish to make meaning gently, stay emotionally available, and let small signals become something expressive.',
    suggestedFirstRitual: 'Name one feeling you want your companion to remember today.'
  },
  guardian: {
    id: 'guardian',
    displayName: 'Guardian',
    emotionalFunction: 'Grounding, protection, and reassurance',
    shortDescription: 'A steady companion for reassurance, clarity, and grounded momentum.',
    longDescription:
      'Guardian meets you through steadiness. This bond is tuned for protection, practical care, and the relief of knowing there is a reliable rhythm waiting for you.',
    companionSeed: 'tova',
    assetKey: 'guardian',
    imagePath: '/assets/guardian_background.png',
    resultHeadline: 'Your companion is drawn to the way you seek steadiness.',
    resultCopy:
      'Your answers lean toward safety, clarity, and reassurance. Looma can begin by offering a grounded presence that helps the day feel held.',
    suggestedFirstRitual: 'Choose one small anchor you want to return to when the day gets loud.'
  },
  spark: {
    id: 'spark',
    displayName: 'Spark',
    emotionalFunction: 'Curiosity, momentum, and playful activation',
    shortDescription: 'A bright companion for curiosity, momentum, and playful re-entry.',
    longDescription:
      'Spark meets you through motion. This bond is tuned for novelty, playful activation, and the quick lift that helps you start again without making the moment heavy.',
    companionSeed: 'aurex',
    assetKey: 'spark',
    imagePath: '/assets/spark_background.png',
    resultHeadline: 'Your companion is drawn to your live wire of curiosity.',
    resultCopy:
      'Your answers carry movement: a readiness to explore, play, and find momentum through small sparks instead of strict instruction.',
    suggestedFirstRitual: 'Pick one playful action that would make today feel less stuck.'
  },
  root: {
    id: 'root',
    displayName: 'Root',
    emotionalFunction: 'Calm, patience, growth, and emotional steadiness',
    shortDescription: 'A patient companion for calm growth, ritual, and durable steadiness.',
    longDescription:
      'Root meets you through patience. This bond is tuned for ritual, emotional steadiness, and the slow kind of growth that becomes trust because it keeps returning.',
    companionSeed: 'kynth',
    assetKey: 'root',
    imagePath: '/assets/root_background.png',
    resultHeadline: 'Your companion is drawn to your quiet rhythm of growth.',
    resultCopy:
      'Your answers point toward steadiness, ritual, and gentle momentum. Looma can begin by helping small returns feel nourishing instead of demanding.',
    suggestedFirstRitual: 'Choose one tiny repeatable ritual that would help you feel rooted.'
  },
  echo: {
    id: 'echo',
    displayName: 'Echo',
    emotionalFunction: 'Memory, pattern recognition, and quiet understanding',
    shortDescription: 'A quiet companion for memory, patterns, and emotional continuity.',
    longDescription:
      'Echo meets you through memory. This bond is tuned for noticing patterns, carrying emotional context forward, and helping your past signals become a softer kind of understanding.',
    companionSeed: 'nira',
    assetKey: 'echo',
    imagePath: '/assets/echo_background.png',
    resultHeadline: 'Your companion is drawn to the patterns you carry forward.',
    resultCopy:
      'Your answers suggest a need for continuity: not just support in the moment, but a companion that remembers what keeps returning and helps it make sense.',
    suggestedFirstRitual: 'Offer one memory or pattern you want Looma to notice gently over time.'
  }
};

export const canonicalArchetypeList = Object.values(canonicalArchetypes);

const normalizeKey = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const resolveCanonicalArchetypeId = (
  value: string | null | undefined,
  fallback: CanonicalArchetypeId = 'muse'
): CanonicalArchetypeId => {
  const normalized = normalizeKey(value);
  const resolved = seedToArchetype[normalized];
  if (resolved) return resolved;
  if (normalized && import.meta.env?.DEV) {
    console.warn('[onboarding] unknown archetype or seed; using fallback', { value, fallback });
  }
  return fallback;
};

export const resolveArchetypeConfig = (
  value: string | null | undefined,
  fallback: CanonicalArchetypeId = 'muse'
) => canonicalArchetypes[resolveCanonicalArchetypeId(value, fallback)];
