export type PortableIdentity = {
  archetype: string;
  traits: string[];
  tone: string;
  updatedAt: string;
  source: string;
};

const clampString = (value: unknown, max = 64) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

export const coercePortableIdentity = (input: unknown): PortableIdentity | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const payload = input as Record<string, unknown>;
  const archetype = clampString(payload.archetype, 48);
  const tone = clampString(payload.tone, 48);
  const traits = Array.isArray(payload.traits)
    ? payload.traits
        .map((entry) => clampString(entry, 32))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 12)
    : [];
  if (!archetype || !tone) return null;
  return {
    archetype,
    traits,
    tone,
    updatedAt: clampString(payload.updatedAt, 64) ?? new Date().toISOString(),
    source: clampString(payload.source, 48) ?? 'identity'
  };
};
