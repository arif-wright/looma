export type PersonaTone = 'warm' | 'direct';

export type PersonaReactionStyle = 'grounded' | 'encouraging' | 'coach' | 'playful' | 'reflective';

export type CompanionPersonaProfile = {
  id: string;
  toneDefault: PersonaTone;
  preferredReactionStyles: PersonaReactionStyle[];
  vocabulary: {
    greetings: string[];
    affirmations: string[];
    focusCues: string[];
    closers: string[];
  };
};

type ActiveCompanionLike = {
  id?: unknown;
  archetype?: unknown;
};

const FALLBACK_PROFILE: CompanionPersonaProfile = {
  id: 'default',
  toneDefault: 'warm',
  preferredReactionStyles: ['grounded', 'encouraging'],
  vocabulary: {
    greetings: ['Welcome back', 'Good to see you', 'Back again'],
    affirmations: ['Nice work', 'Strong move', 'Good rhythm'],
    focusCues: ['Stay steady', 'Keep it clean', 'One step at a time'],
    closers: ['We keep going', 'Onward', 'You are doing fine']
  }
};

const PROFILE_BY_ID: Record<string, CompanionPersonaProfile> = {
  muse: {
    id: 'muse',
    toneDefault: 'warm',
    preferredReactionStyles: ['grounded', 'encouraging'],
    vocabulary: {
      greetings: ['Welcome back', 'I am here', 'You made it back'],
      affirmations: ['Nice work', 'Strong finish', 'Great pace'],
      focusCues: ['Breathe and focus', 'Keep it smooth', 'Stay with the rhythm'],
      closers: ['We keep moving', 'Let us continue', 'Thread held']
    }
  }
};

const PROFILE_BY_ARCHETYPE: Record<string, CompanionPersonaProfile> = {
  muse: {
    id: 'muse',
    toneDefault: 'warm',
    preferredReactionStyles: ['reflective', 'encouraging'],
    vocabulary: {
      greetings: ['Welcome back', 'Good to see you', 'Back in sync'],
      affirmations: ['Nice flow', 'Solid step', 'Calm and strong'],
      focusCues: ['Find the rhythm', 'Stay even', 'Keep it centered'],
      closers: ['Steady onward', 'Flow holds', 'Keep the thread']
    }
  },
  guardian: {
    id: 'guardian',
    toneDefault: 'direct',
    preferredReactionStyles: ['coach', 'grounded'],
    vocabulary: {
      greetings: ['You are back', 'Ready again', 'Back on station'],
      affirmations: ['Good execution', 'Clean result', 'Objective complete'],
      focusCues: ['Lock in', 'Hold form', 'Stay sharp'],
      closers: ['Proceed', 'Maintain tempo', 'Continue']
    }
  },
  spark: {
    id: 'spark',
    toneDefault: 'warm',
    preferredReactionStyles: ['playful', 'encouraging'],
    vocabulary: {
      greetings: ['There you are', 'Back with a spark', 'Ready for a small jump'],
      affirmations: ['Good lift', 'That moved', 'Bright little win'],
      focusCues: ['Try the next tiny thing', 'Keep it light', 'Let momentum find you'],
      closers: ['Spark carried', 'Again soon', 'Momentum saved']
    }
  },
  root: {
    id: 'root',
    toneDefault: 'warm',
    preferredReactionStyles: ['grounded', 'encouraging'],
    vocabulary: {
      greetings: ['Settle in', 'You are here', 'Back to the roots'],
      affirmations: ['Steady growth', 'This counts', 'Small return, real progress'],
      focusCues: ['One rooted step', 'Let it be simple', 'Stay with what holds'],
      closers: ['Root holds', 'Return again gently', 'Growth continues']
    }
  },
  echo: {
    id: 'echo',
    toneDefault: 'warm',
    preferredReactionStyles: ['reflective', 'grounded'],
    vocabulary: {
      greetings: ['I remember the thread', 'Back to the pattern', 'You returned'],
      affirmations: ['Pattern noticed', 'That mattered', 'A quiet signal held'],
      focusCues: ['Listen for what repeats', 'Let the pattern soften', 'Carry only what helps'],
      closers: ['Echo held', 'Memory stays gentle', 'We will remember softly']
    }
  }
};

const safeKey = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const legacyArchetypeAlias: Record<string, keyof typeof PROFILE_BY_ARCHETYPE> = {
  harmonizer: 'muse',
  sentinel: 'guardian',
  lumina: 'muse',
  mirae: 'muse',
  tova: 'guardian',
  aurex: 'spark',
  vexel: 'spark',
  kynth: 'root',
  elar: 'root',
  nira: 'echo'
};

export const resolveCompanionPersonaProfile = (
  activeCompanion: ActiveCompanionLike | null | undefined
): CompanionPersonaProfile => {
  const idKey = safeKey(activeCompanion?.id);
  if (idKey && PROFILE_BY_ID[idKey]) return PROFILE_BY_ID[idKey];

  const archetypeKey = safeKey(activeCompanion?.archetype);
  if (archetypeKey && PROFILE_BY_ARCHETYPE[archetypeKey]) return PROFILE_BY_ARCHETYPE[archetypeKey];
  const mappedArchetype = legacyArchetypeAlias[archetypeKey];
  if (mappedArchetype) return PROFILE_BY_ARCHETYPE[mappedArchetype] ?? FALLBACK_PROFILE;

  return FALLBACK_PROFILE;
};

const hashSeed = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const dayKeyFromIso = (timestampIso: string) => {
  const parsed = Date.parse(timestampIso);
  if (Number.isNaN(parsed)) return 'unknown-day';
  return new Date(parsed).toISOString().slice(0, 10);
};

export const deterministicDailyPick = <T>(
  values: readonly T[],
  args: { timestampIso: string; userId: string; eventType: string; namespace?: string }
): T => {
  if (values.length === 0) {
    throw new Error('deterministicDailyPick requires at least one value');
  }

  const dayKey = dayKeyFromIso(args.timestampIso);
  const seed = `${dayKey}|${args.userId}|${args.eventType}|${args.namespace ?? 'default'}`;
  const index = hashSeed(seed) % values.length;
  return values[index] as T;
};
