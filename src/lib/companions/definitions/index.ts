import { ECHO_DEFINITION } from './echo';
import { GUARDIAN_DEFINITION } from './guardian';
import { MUSE_DEFINITION } from './muse';
import { ROOT_DEFINITION } from './root';
import { SPARK_DEFINITION } from './spark';
import type { CompanionDefinition, CompanionDefinitionCatalogEntry } from './types';
import {
  canonicalArchetypeList,
  resolveCanonicalArchetypeId,
  seedToArchetype
} from '$lib/onboarding/archetypes';

const normalizeToken = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const BASE_DEFINITIONS: CompanionDefinition[] = [
  MUSE_DEFINITION,
  GUARDIAN_DEFINITION,
  SPARK_DEFINITION,
  ROOT_DEFINITION,
  ECHO_DEFINITION
];
const SHARED_MODEL_RENDER_HOOK = MUSE_DEFINITION.renderHook;

const DEFINITION_BY_KEY = new Map(BASE_DEFINITIONS.map((entry) => [normalizeToken(entry.key), entry] as const));
const DEFINITION_BY_NAME = new Map(BASE_DEFINITIONS.map((entry) => [normalizeToken(entry.name), entry] as const));
const DEFINITION_BY_SEED = new Map(BASE_DEFINITIONS.map((entry) => [normalizeToken(entry.seed), entry] as const));

const resolveDefinitionForToken = (token: string | null | undefined): CompanionDefinition | null => {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  const mapped = seedToArchetype[normalized];
  return (
    DEFINITION_BY_KEY.get(normalized) ??
    DEFINITION_BY_NAME.get(normalized) ??
    DEFINITION_BY_SEED.get(normalized) ??
    (mapped ? DEFINITION_BY_KEY.get(mapped) ?? null : null)
  );
};

export const resolveCompanionDefinition = (args: {
  key?: string | null | undefined;
  name?: string | null | undefined;
}): CompanionDefinition | null => {
  return resolveDefinitionForToken(args.key) ?? resolveDefinitionForToken(args.name);
};

export const buildCompanionDiscoverCatalog = (
  dbArchetypes: Array<{
    key: string;
    name: string;
    description: string;
    color: string;
    seed: string;
  }>
): CompanionDefinitionCatalogEntry[] => {
  const dbSeedByCanonical = new Map(
    dbArchetypes.map((entry) => [resolveCanonicalArchetypeId(entry.key), entry] as const)
  );
  const merged = new Map<string, CompanionDefinitionCatalogEntry>();

  for (const archetype of canonicalArchetypeList) {
    const localDef = resolveCompanionDefinition({ key: archetype.id, name: archetype.displayName });
    const seedRow = dbSeedByCanonical.get(archetype.id);
    const color = seedRow?.color ?? localDef?.color ?? '#5ef2ff';
    if (merged.has(archetype.id)) continue;
    merged.set(archetype.id, {
      key: archetype.id,
      name: archetype.displayName,
      description: archetype.shortDescription,
      color,
      seed: archetype.companionSeed,
      renderHook: localDef?.renderHook ?? SHARED_MODEL_RENDER_HOOK,
      locked: localDef?.lockedByDefault === true
    });
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const buildCompanionArchetypeMetadataByCompanionId = (companions: Array<{ id: string; species?: string | null }>) => {
  return companions.reduce<Record<string, { renderHook: string; archetypeKey: string | null }>>((acc, companion) => {
    const definition = resolveCompanionDefinition({ key: companion.species, name: companion.species });
    const archetypeKey = resolveCanonicalArchetypeId(definition?.key ?? companion.species, 'muse');
    acc[companion.id] = {
      renderHook: definition?.renderHook ?? SHARED_MODEL_RENDER_HOOK,
      archetypeKey
    };
    return acc;
  }, {});
};

export const COMPANION_DEFINITIONS = BASE_DEFINITIONS;
