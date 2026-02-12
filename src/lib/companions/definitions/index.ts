import { GUARDIAN_DEFINITION } from './guardian';
import { MUSE_DEFINITION } from './muse';
import { SPARK_DEFINITION } from './spark';
import type { CompanionDefinition, CompanionDefinitionCatalogEntry } from './types';

const normalizeToken = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const BASE_DEFINITIONS: CompanionDefinition[] = [MUSE_DEFINITION, GUARDIAN_DEFINITION, SPARK_DEFINITION];

const DEFINITION_BY_KEY = new Map(BASE_DEFINITIONS.map((entry) => [normalizeToken(entry.key), entry] as const));
const DEFINITION_BY_NAME = new Map(BASE_DEFINITIONS.map((entry) => [normalizeToken(entry.name), entry] as const));

const resolveDefinitionForToken = (token: string | null | undefined): CompanionDefinition | null => {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  return DEFINITION_BY_KEY.get(normalized) ?? DEFINITION_BY_NAME.get(normalized) ?? null;
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
  const merged = new Map<string, CompanionDefinitionCatalogEntry>();

  for (const dbEntry of dbArchetypes) {
    const localDef = resolveCompanionDefinition({ key: dbEntry.key, name: dbEntry.name });
    const key = (dbEntry.key ?? '').trim();
    if (!key) continue;

    merged.set(key, {
      key,
      name: dbEntry.name,
      description: dbEntry.description,
      color: dbEntry.color,
      seed: dbEntry.seed,
      renderHook: localDef?.renderHook ?? 'default_core',
      locked: localDef?.lockedByDefault === true
    });
  }

  for (const localDef of BASE_DEFINITIONS) {
    if (merged.has(localDef.key)) continue;
    merged.set(localDef.key, {
      key: localDef.key,
      name: localDef.name,
      description: localDef.description,
      color: localDef.color,
      seed: localDef.seed,
      renderHook: localDef.renderHook,
      locked: localDef.lockedByDefault === true
    });
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const buildCompanionArchetypeMetadataByCompanionId = (companions: Array<{ id: string; species?: string | null }>) => {
  return companions.reduce<Record<string, { renderHook: string; archetypeKey: string | null }>>((acc, companion) => {
    const definition = resolveCompanionDefinition({ key: companion.species, name: companion.species });
    acc[companion.id] = {
      renderHook: definition?.renderHook ?? 'default_core',
      archetypeKey: definition?.key ?? null
    };
    return acc;
  }, {});
};

export const COMPANION_DEFINITIONS = BASE_DEFINITIONS;
