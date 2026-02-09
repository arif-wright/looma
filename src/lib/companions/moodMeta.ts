export type CompanionMoodKey = 'radiant' | 'curious' | 'steady' | 'tired';

export type CompanionMoodMeta = {
  key: CompanionMoodKey;
  label: string;
  description: string;
  accent: 'cyan' | 'magenta' | 'slate' | 'amber';
  emoji: string;
  indicatorTitle: string;
};

const BASE_MOOD: Record<CompanionMoodKey, CompanionMoodMeta> = {
  radiant: {
    key: 'radiant',
    label: 'Radiant',
    description: 'Radiant · deeply bonded and energized.',
    accent: 'cyan',
    emoji: '✨',
    indicatorTitle: 'feeling radiant'
  },
  curious: {
    key: 'curious',
    label: 'Curious',
    description: 'Curious · eager to explore with you.',
    accent: 'magenta',
    emoji: '🔭',
    indicatorTitle: 'feeling curious'
  },
  steady: {
    key: 'steady',
    label: 'Steady',
    description: 'Steady · content at your side.',
    accent: 'slate',
    emoji: '🌙',
    indicatorTitle: 'feeling steady'
  },
  tired: {
    key: 'tired',
    label: 'Tired',
    description: 'Tired · could use a gentle rest.',
    accent: 'amber',
    emoji: '😴',
    indicatorTitle: 'feeling tired'
  }
};

export const normalizeMoodKey = (mood: string | null | undefined): CompanionMoodKey => {
  const lowered = (mood ?? '').toLowerCase();
  if (lowered === 'happy' || lowered === 'joyful' || lowered === 'energized') return 'radiant';
  if (lowered === 'radiant') return 'radiant';
  if (lowered === 'curious') return 'curious';
  if (lowered === 'tired' || lowered === 'low_energy' || lowered === 'resting') return 'tired';
  if (lowered === 'neutral' || lowered === 'content' || lowered === 'idle' || lowered === 'calm') return 'steady';
  return 'steady';
};

export const getCompanionMoodMeta = (mood: string | null | undefined): CompanionMoodMeta => {
  const key = normalizeMoodKey(mood);
  return BASE_MOOD[key];
};

export const getCompanionMoodCopy = (mood: string | null | undefined): string =>
  getCompanionMoodMeta(mood).description;
