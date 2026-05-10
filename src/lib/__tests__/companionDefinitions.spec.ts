import { describe, expect, it } from 'vitest';
import {
  buildCompanionArchetypeMetadataByCompanionId,
  buildCompanionDiscoverCatalog,
  COMPANION_DEFINITIONS
} from '$lib/companions/definitions';

describe('companion definitions', () => {
  it('uses the shared Muse render hook for every companion type while only one model exists', () => {
    expect(COMPANION_DEFINITIONS.every((definition) => definition.renderHook === 'muse_core')).toBe(true);
  });

  it('attaches an element profile to every companion definition', () => {
    expect(
      COMPANION_DEFINITIONS.every(
        (definition) =>
          definition.elementProfile.primary &&
          definition.elementProfile.secondary &&
          definition.elementProfile.emotionalDomain &&
          definition.elementProfile.preferredRituals.length > 0
      )
    ).toBe(true);

    const muse = COMPANION_DEFINITIONS.find((definition) => definition.key === 'muse');
    expect(muse?.elementProfile.primary).toBe('sound');
    expect(muse?.elementProfile.secondary).toBe('light');
    expect(muse?.elementProfile.emotionalDomain).toBe('Harmony');
  });

  it('falls back to the shared Muse render hook for unknown or database-only companion types', () => {
    const metadata = buildCompanionArchetypeMetadataByCompanionId([
      { id: 'known', species: 'Guardian' },
      { id: 'legacy', species: 'looma' },
      { id: 'missing', species: null }
    ]);

    expect(metadata.known?.renderHook).toBe('muse_core');
    expect(metadata.legacy?.renderHook).toBe('muse_core');
    expect(metadata.missing?.renderHook).toBe('muse_core');
    expect(metadata.known?.archetypeKey).toBe('guardian');
    expect(metadata.legacy?.archetypeKey).toBe('muse');

    const catalog = buildCompanionDiscoverCatalog([
      {
        key: 'lumina',
        name: 'Lumina',
        description: 'A server-defined companion seed.',
        color: '#ffffff',
        seed: 'temporary'
      }
    ]);

    expect(catalog.map((entry) => entry.key).sort()).toEqual(['echo', 'guardian', 'muse', 'root', 'spark']);
    expect(catalog.every((entry) => entry.renderHook === 'muse_core')).toBe(true);
  });
});
