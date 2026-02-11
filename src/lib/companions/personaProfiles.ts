export type PersonaTone = 'warm' | 'direct';

export type PersonaReactionStyle = 'grounded' | 'encouraging' | 'coach';

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
  harmonizer: {
    id: 'harmonizer',
    toneDefault: 'warm',
    preferredReactionStyles: ['grounded', 'encouraging'],
    vocabulary: {
      greetings: ['Welcome back', 'Good to see you', 'Back in sync'],
      affirmations: ['Nice flow', 'Solid step', 'Calm and strong'],
      focusCues: ['Find the rhythm', 'Stay even', 'Keep it centered'],
      closers: ['Steady onward', 'Flow holds', 'Keep the thread']
    }
  },
  sentinel: {
    id: 'sentinel',
    toneDefault: 'direct',
    preferredReactionStyles: ['coach', 'grounded'],
    vocabulary: {
      greetings: ['You are back', 'Ready again', 'Back on station'],
      affirmations: ['Good execution', 'Clean result', 'Objective complete'],
      focusCues: ['Lock in', 'Hold form', 'Stay sharp'],
      closers: ['Proceed', 'Maintain tempo', 'Continue']
    }
  }
};

const safeKey = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

export const resolveCompanionPersonaProfile = (activeCompanion: ActiveCompanionLike | null | undefined) => {
  const idKey = safeKey(activeCompanion?.id);
  if (idKey && PROFILE_BY_ID[idKey]) return PROFILE_BY_ID[idKey];

  const archetypeKey = safeKey(activeCompanion?.archetype);
  if (archetypeKey && PROFILE_BY_ARCHETYPE[archetypeKey]) return PROFILE_BY_ARCHETYPE[archetypeKey];

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
