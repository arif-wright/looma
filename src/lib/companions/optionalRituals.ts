export type OptionalCompanionRitualKey = 'listen' | 'focus' | 'celebrate';

export type OptionalCompanionRitualDefinition = {
  key: OptionalCompanionRitualKey;
  title: string;
  description: string;
  eventType: `companion.ritual.${OptionalCompanionRitualKey}`;
  cooldownMs: number;
  temporaryMood?: 'focused';
  temporaryMoodMs?: number;
};

export const OPTIONAL_COMPANION_RITUALS: OptionalCompanionRitualDefinition[] = [
  {
    key: 'listen',
    title: 'Listen',
    description: 'Take a short calm beat together.',
    eventType: 'companion.ritual.listen',
    cooldownMs: 60 * 60 * 1000
  },
  {
    key: 'focus',
    title: 'Focus',
    description: 'Set a focused tone for a little while.',
    eventType: 'companion.ritual.focus',
    cooldownMs: 60 * 60 * 1000,
    temporaryMood: 'focused',
    temporaryMoodMs: 15 * 60 * 1000
  },
  {
    key: 'celebrate',
    title: 'Celebrate',
    description: 'Mark a win with your companion.',
    eventType: 'companion.ritual.celebrate',
    cooldownMs: 60 * 60 * 1000
  }
];

export const OPTIONAL_COMPANION_RITUAL_MAP = new Map(
  OPTIONAL_COMPANION_RITUALS.map((entry) => [entry.key, entry])
);

export const formatCooldownSeconds = (valueMs: number) => Math.max(0, Math.ceil(valueMs / 1000));
