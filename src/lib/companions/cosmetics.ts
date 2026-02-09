export const AURA_COLOR_OPTIONS = ['cyan', 'amber', 'mint', 'rose'] as const;

export type AuraColor = (typeof AURA_COLOR_OPTIONS)[number];

export type CompanionCosmetics = {
  auraColor: AuraColor;
  glowIntensity: number;
} & Record<string, string | number | boolean | null>;

export const DEFAULT_COMPANION_COSMETICS: CompanionCosmetics = {
  auraColor: 'cyan',
  glowIntensity: 55
};

const isAuraColor = (value: unknown): value is AuraColor =>
  typeof value === 'string' && (AURA_COLOR_OPTIONS as readonly string[]).includes(value);

const toGlowIntensity = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return DEFAULT_COMPANION_COSMETICS.glowIntensity;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export const normalizeCompanionCosmetics = (input: unknown): CompanionCosmetics => {
  const base: CompanionCosmetics = { ...DEFAULT_COMPANION_COSMETICS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const raw = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      base[key] = value;
    } else if (value === null) {
      base[key] = null;
    }
  }

  base.auraColor = isAuraColor(raw.auraColor) ? raw.auraColor : DEFAULT_COMPANION_COSMETICS.auraColor;
  base.glowIntensity = toGlowIntensity(raw.glowIntensity);
  return base;
};

