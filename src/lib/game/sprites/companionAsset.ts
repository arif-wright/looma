import { seedToArchetype, type CanonicalArchetypeId } from '$lib/onboarding/archetypes';

export const MUSE_PRODUCTION_MANIFEST_URL = '/game/sprites/companions/muse/muse.atlas.json';
export const ECHO_PRODUCTION_MANIFEST_URL = '/game/sprites/companions/echo/echo.atlas.json';

const normalizeIdentity = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export type CompanionSpriteSelection = {
  suppliedIdentity: string;
  normalizedIdentity: string;
  archetype: CanonicalArchetypeId | 'unknown';
  manifestUrl: string;
  muse: boolean;
  production: boolean;
};

export const selectCompanionSpriteAsset = (kind: string | null | undefined): CompanionSpriteSelection => {
  const suppliedIdentity = kind?.trim() ?? '';
  const normalizedIdentity = normalizeIdentity(kind);
  const archetype = seedToArchetype[normalizedIdentity] ?? 'unknown';
  const muse = archetype === 'muse';
  const productionManifest = muse ? MUSE_PRODUCTION_MANIFEST_URL
    : archetype === 'echo' ? ECHO_PRODUCTION_MANIFEST_URL : null;
  return {
    suppliedIdentity,
    normalizedIdentity,
    archetype,
    muse,
    production: Boolean(productionManifest),
    manifestUrl: productionManifest ?? `/game/sprites/companions/${encodeURIComponent(normalizedIdentity || 'companion')}/companion.atlas.json`
  };
};
