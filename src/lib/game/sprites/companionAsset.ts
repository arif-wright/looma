import { seedToArchetype, type CanonicalArchetypeId } from '$lib/onboarding/archetypes';

export const MUSE_PRODUCTION_MANIFEST_URL = '/game/sprites/companions/muse/muse.atlas.json';

const normalizeIdentity = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export type CompanionSpriteSelection = {
  suppliedIdentity: string;
  normalizedIdentity: string;
  archetype: CanonicalArchetypeId | 'unknown';
  manifestUrl: string;
  muse: boolean;
};

export const selectCompanionSpriteAsset = (kind: string | null | undefined): CompanionSpriteSelection => {
  const suppliedIdentity = kind?.trim() ?? '';
  const normalizedIdentity = normalizeIdentity(kind);
  const archetype = seedToArchetype[normalizedIdentity] ?? 'unknown';
  const muse = archetype === 'muse';
  return {
    suppliedIdentity,
    normalizedIdentity,
    archetype,
    muse,
    manifestUrl: muse
      ? MUSE_PRODUCTION_MANIFEST_URL
      : `/game/sprites/companions/${encodeURIComponent(normalizedIdentity || 'companion')}/companion.atlas.json`
  };
};
