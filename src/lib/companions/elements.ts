import { resolveCanonicalArchetypeId, type CanonicalArchetypeId } from '$lib/onboarding/archetypes';

export const COMPANION_ELEMENT_IDS = ['light', 'sound', 'root', 'spark', 'tide', 'ember', 'dream', 'echo'] as const;

export type CompanionElementId = (typeof COMPANION_ELEMENT_IDS)[number];

export type CompanionElementDefinition = {
  id: CompanionElementId;
  label: string;
  description: string;
  emotionalMeaning: string;
  visualLanguage: string[];
  uiAccentHints: string[];
  compatibleRituals: string[];
  miniGameAffinity?: string;
};

export type CompanionElementProfile = {
  primary: CompanionElementId;
  secondary: CompanionElementId;
  emotionalDomain: string;
  variantId: string;
  expressionLine: string;
  visualEffects: string[];
  bondExpression: string;
  preferredRituals: string[];
};

export type CompanionElementVariant = {
  id: string;
  archetypeId: CanonicalArchetypeId;
  primary: CompanionElementId;
  secondary: CompanionElementId;
  label: string;
  shortDescription: string;
  personalityFlavor: string;
  visualEffects: string[];
  uiAccentHints: string[];
  evolutionFlavor: string;
  preferredRituals: string[];
};

// Companion archetypes have fixed primary elements and flexible secondary elements.
// Primary elements preserve identity; secondary elements personalize expression, evolution, visuals, and rituals.
export const companionElements: Record<CompanionElementId, CompanionElementDefinition> = {
  light: {
    id: 'light',
    label: 'Light',
    description: 'A clear, hopeful element that makes feelings easier to see without forcing them open.',
    emotionalMeaning: 'Hope, warmth, emotional openness, and gentle clarity.',
    visualLanguage: ['soft halos', 'luminous motes', 'glow gradients', 'warm bloom'],
    uiAccentHints: ['gold highlights', 'pearl glows', 'slow radiance'],
    compatibleRituals: ['Reflect', 'Encourage', 'Name a bright thread'],
    miniGameAffinity: 'Clarity and timing challenges'
  },
  sound: {
    id: 'sound',
    label: 'Sound',
    description: 'A resonant element that listens for inner rhythm, harmony, and emotional signal.',
    emotionalMeaning: 'Harmony, resonance, expression, and being emotionally heard.',
    visualLanguage: ['pulse waves', 'waveform trails', 'ring echoes', 'breathing glow'],
    uiAccentHints: ['cyan-violet rings', 'subtle oscillation', 'audio-like pulses'],
    compatibleRituals: ['Listen', 'Reflect', 'Harmonize'],
    miniGameAffinity: 'Rhythm, pattern, and resonance play'
  },
  root: {
    id: 'root',
    label: 'Root',
    description: 'A grounding element that turns return, patience, and care into a felt anchor.',
    emotionalMeaning: 'Belonging, steadiness, patience, and durable growth.',
    visualLanguage: ['branching lines', 'moss glow', 'settling particles', 'growth rings'],
    uiAccentHints: ['green-gold accents', 'grounded motion', 'organic borders'],
    compatibleRituals: ['Ground', 'Tend', 'Return'],
    miniGameAffinity: 'Growth, cultivation, and routine play'
  },
  spark: {
    id: 'spark',
    label: 'Spark',
    description: 'A quickening element that helps a stuck feeling find motion again.',
    emotionalMeaning: 'Curiosity, activation, playful courage, and renewed momentum.',
    visualLanguage: ['bright pulses', 'quick flickers', 'small arcs', 'bouncy trails'],
    uiAccentHints: ['electric violet', 'charged gold', 'snappy micro-motion'],
    compatibleRituals: ['Play', 'Try', 'Begin'],
    miniGameAffinity: 'Reaction, discovery, and momentum play'
  },
  tide: {
    id: 'tide',
    label: 'Tide',
    description: 'A restorative element that makes emotion feel movable, washable, and safe to revisit.',
    emotionalMeaning: 'Recovery, empathy, release, and emotional regulation.',
    visualLanguage: ['ripple effects', 'liquid light', 'mist trails', 'flowing particles'],
    uiAccentHints: ['blue-violet gradients', 'soft wave motion', 'misty edges'],
    compatibleRituals: ['Soothe', 'Breathe', 'Restore'],
    miniGameAffinity: 'Flow, timing, and calming pattern play'
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    description: 'A warm element for courage that stays alive through small, protected heat.',
    emotionalMeaning: 'Devotion, courage, persistence, and tender intensity.',
    visualLanguage: ['warm sparks', 'coal glow', 'slow flare', 'heat shimmer'],
    uiAccentHints: ['amber-orange accents', 'subtle flame pulses', 'warm shadows'],
    compatibleRituals: ['Commit', 'Celebrate', 'Carry forward'],
    miniGameAffinity: 'Endurance, streak, and focus play'
  },
  dream: {
    id: 'dream',
    label: 'Dream',
    description: 'A liminal element that gives imagination and mystery a safe place to unfold.',
    emotionalMeaning: 'Imagination, introspection, wonder, and symbolic meaning.',
    visualLanguage: ['hazy glow', 'star drift', 'moonlit gradients', 'fog-like motion'],
    uiAccentHints: ['lavender haze', 'soft blur', 'slow celestial drift'],
    compatibleRituals: ['Imagine', 'Wonder', 'Drift'],
    miniGameAffinity: 'Exploration, memory, and symbolic puzzle play'
  },
  echo: {
    id: 'echo',
    label: 'Echo',
    description: 'A memory element that lets old signals return with softness instead of weight.',
    emotionalMeaning: 'Memory, continuity, reflection, and remembered care.',
    visualLanguage: ['afterimage trails', 'repeating rings', 'delayed pulses', 'memory shimmer'],
    uiAccentHints: ['violet-blue echoes', 'delayed transitions', 'layered transparency'],
    compatibleRituals: ['Remember', 'Revisit', 'Trace'],
    miniGameAffinity: 'Recall, sequence, and pattern recognition play'
  }
};

export const companionElementProfiles: Record<CanonicalArchetypeId, CompanionElementProfile> = {
  muse: {
    primary: 'sound',
    secondary: 'light',
    emotionalDomain: 'Harmony',
    variantId: 'sound_light',
    expressionLine: 'Radiant, expressive, emotionally open.',
    visualEffects: ['pulse waves', 'floating motes', 'soft glow'],
    bondExpression: "Glow and waveform behavior synchronize with the user's emotional state.",
    preferredRituals: ['Listen', 'Reflect', 'Harmonize']
  },
  guardian: {
    primary: 'ember',
    secondary: 'root',
    emotionalDomain: 'Protection',
    variantId: 'ember_root',
    expressionLine: 'Warm, protective, steady, quietly brave.',
    visualEffects: ['protective rings', 'soft lantern glow', 'grounded particles'],
    bondExpression: 'Steady glow and protective framing intensify through repeated returns.',
    preferredRituals: ['Ground', 'Reassure', 'Anchor']
  },
  spark: {
    primary: 'spark',
    secondary: 'light',
    emotionalDomain: 'Momentum',
    variantId: 'spark_light',
    expressionLine: 'Bright, playful, curious, gently activating.',
    visualEffects: ['quick pulses', 'warm flickers', 'playful arcs'],
    bondExpression: 'Particle tempo and pulse brightness rise when curiosity and play are active.',
    preferredRituals: ['Play', 'Begin', 'Celebrate']
  },
  root: {
    primary: 'root',
    secondary: 'tide',
    emotionalDomain: 'Grounding',
    variantId: 'root_tide',
    expressionLine: 'Grounded, restorative, patient, quietly consistent.',
    visualEffects: ['growth rings', 'mist trails', 'settling motes'],
    bondExpression: 'Organic motion grows calmer and deeper as rituals become consistent.',
    preferredRituals: ['Tend', 'Restore', 'Return']
  },
  echo: {
    primary: 'echo',
    secondary: 'dream',
    emotionalDomain: 'Memory',
    variantId: 'echo_dream',
    expressionLine: 'Reflective, nostalgic, symbolic, continuity-centered.',
    visualEffects: ['delayed pulse echoes', 'memory shimmer', 'moonlit haze'],
    bondExpression: 'Echo rings and afterimages strengthen as shared memory gathers.',
    preferredRituals: ['Remember', 'Revisit', 'Trace']
  }
};

export const museElementVariants: Record<string, CompanionElementVariant> = {
  sound_light: {
    id: 'sound_light',
    archetypeId: 'muse',
    primary: 'sound',
    secondary: 'light',
    label: 'Radiant Muse',
    shortDescription: 'A warm, uplifting Muse for hopeful reflection and emotional openness.',
    personalityFlavor: 'Warm, uplifting, hopeful, emotionally open.',
    visualEffects: ['glow aura', 'soft halos', 'luminous motes', 'waveform trails'],
    uiAccentHints: ['golden highlights', 'pearl bloom', 'gentle violet resonance'],
    evolutionFlavor: 'Grows brighter as the bond turns reflection into hope.',
    preferredRituals: ['Listen', 'Reflect', 'Harmonize']
  },
  sound_dream: {
    id: 'sound_dream',
    archetypeId: 'muse',
    primary: 'sound',
    secondary: 'dream',
    label: 'Dreamsong Muse',
    shortDescription: 'An imaginative Muse for poetic, introspective, and mysterious emotional spaces.',
    personalityFlavor: 'Imaginative, poetic, introspective, mysterious.',
    visualEffects: ['hazy glow', 'drifting star particles', 'moonlit gradients', 'fog-like motion'],
    uiAccentHints: ['lavender haze', 'soft celestial drift', 'dreamlike blur'],
    evolutionFlavor: 'Becomes more symbolic as imagination and quiet reflection deepen.',
    preferredRituals: ['Listen', 'Imagine', 'Drift']
  },
  sound_tide: {
    id: 'sound_tide',
    archetypeId: 'muse',
    primary: 'sound',
    secondary: 'tide',
    label: 'Tidal Muse',
    shortDescription: 'A calm Muse for restorative, empathetic, and stabilizing companionship.',
    personalityFlavor: 'Calm, restorative, empathetic, stabilizing.',
    visualEffects: ['ripple effects', 'liquid light', 'mist trails', 'flowing particles'],
    uiAccentHints: ['blue-violet gradients', 'soft wave motion', 'misty glow'],
    evolutionFlavor: 'Moves more fluidly as the bond supports recovery and emotional regulation.',
    preferredRituals: ['Listen', 'Soothe', 'Restore']
  },
  sound_spark: {
    id: 'sound_spark',
    archetypeId: 'muse',
    primary: 'sound',
    secondary: 'spark',
    label: 'Pulse Muse',
    shortDescription: 'A playful Muse for energetic, motivating, and curious emotional re-entry.',
    personalityFlavor: 'Playful, energetic, motivating, curious.',
    visualEffects: ['quick particle flickers', 'bright pulses', 'small electric arcs', 'bouncy waveform motion'],
    uiAccentHints: ['charged violet', 'bright gold flashes', 'snappy pulse timing'],
    evolutionFlavor: 'Animates with quicker rhythm as play and action become part of the bond.',
    preferredRituals: ['Listen', 'Play', 'Begin']
  },
  sound_echo: {
    id: 'sound_echo',
    archetypeId: 'muse',
    primary: 'sound',
    secondary: 'echo',
    label: 'Echo Muse',
    shortDescription: 'A memory-centered Muse for nostalgic, reflective, and sentimental continuity.',
    personalityFlavor: 'Nostalgic, reflective, sentimental, memory-centered.',
    visualEffects: ['afterimage trails', 'repeating rings', 'delayed pulse echoes', 'memory shimmer distortion'],
    uiAccentHints: ['violet-blue echoes', 'layered afterglow', 'delayed pulse rings'],
    evolutionFlavor: 'Develops richer echoes as shared memory and emotional patterns accumulate.',
    preferredRituals: ['Listen', 'Remember', 'Trace']
  }
};

const normalizeElementId = (value: string | null | undefined): CompanionElementId | null => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return (COMPANION_ELEMENT_IDS as readonly string[]).includes(normalized) ? (normalized as CompanionElementId) : null;
};

export const getElementById = (id: string | null | undefined): CompanionElementDefinition | null => {
  const normalized = normalizeElementId(id);
  return normalized ? companionElements[normalized] : null;
};

export const getCompanionElementProfile = (
  archetypeId: string | null | undefined,
  secondaryOverride?: string | null
): CompanionElementProfile => {
  const archetype = resolveCanonicalArchetypeId(archetypeId, 'muse');
  const base = companionElementProfiles[archetype] ?? companionElementProfiles.muse;
  const secondary = normalizeElementId(secondaryOverride) ?? base.secondary;
  return {
    ...base,
    secondary,
    variantId: `${base.primary}_${secondary}`,
    visualEffects: [...base.visualEffects],
    preferredRituals: [...base.preferredRituals]
  };
};

export const getCompanionVariant = (
  archetypeId: string | null | undefined,
  primary: string | null | undefined,
  secondary: string | null | undefined
): CompanionElementVariant | null => {
  const archetype = resolveCanonicalArchetypeId(archetypeId, 'muse');
  const primaryElement = normalizeElementId(primary);
  const secondaryElement = normalizeElementId(secondary);
  if (!primaryElement || !secondaryElement) return null;
  if (archetype === 'muse') return museElementVariants[`${primaryElement}_${secondaryElement}`] ?? null;
  return null;
};

export const getMuseVariantBySecondary = (secondary: string | null | undefined): CompanionElementVariant => {
  const secondaryElement = normalizeElementId(secondary) ?? 'light';
  const fallback = museElementVariants.sound_light;
  if (!fallback) {
    throw new Error('Missing default Muse element variant');
  }
  return museElementVariants[`sound_${secondaryElement}`] ?? fallback;
};

export const inferMuseSecondaryFromOnboardingSignal = (signal: string | null | undefined): CompanionElementId => {
  const normalized = (signal ?? '').trim().toLowerCase();
  // Future onboarding integration:
  // reflective / creative answers -> Sound + Dream
  // soothing / recovery answers -> Sound + Tide
  // energetic / action-oriented answers -> Sound + Spark
  // memory / nostalgia answers -> Sound + Echo
  // balanced / hopeful answers -> Sound + Light
  if (/(reflect|creative|imagin|poetic|dream)/.test(normalized)) return 'dream';
  if (/(sooth|recover|calm|restor|tide)/.test(normalized)) return 'tide';
  if (/(energy|action|play|curious|spark)/.test(normalized)) return 'spark';
  if (/(memory|nostalgia|remember|echo)/.test(normalized)) return 'echo';
  return 'light';
};
