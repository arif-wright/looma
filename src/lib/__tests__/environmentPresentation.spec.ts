import { describe, expect, it } from 'vitest';
import manifestJson from '../game/environment/wilds-exploration.environment.json';
import { validateEnvironmentManifest, type EnvironmentAssetDefinition } from '../game/environment/contract';
import {
  cameraRelativeEnvironmentAngle,
  resolveEnvironmentDirection,
  resolveEnvironmentLod,
  resolveEnvironmentRenderClass
} from '../game/environment/presentation';
import { WORLD_TRAVERSAL } from '../game/traversal';
import { environmentFrameForPhase, environmentNormalizedPhaseAt, WILDS_ENVIRONMENT_MANIFEST } from '../game/renderers/three/environmentWorld';

const asset = (overrides: Partial<EnvironmentAssetDefinition>): EnvironmentAssetDefinition => ({
  id: 'test.asset', kind: 'prop', status: 'production', layer: 'prop', renderer: 'billboard',
  width: 256, height: 256, pivot: { x: 0.5, y: 1 }, obstruction: false,
  quality: ['full'], ...overrides
});

describe('environment visual architecture', () => {
  it('resolves version-1 compatibility classes at one explicit boundary', () => {
    expect(resolveEnvironmentRenderClass(asset({ category: 'tree' }))).toBe('directional-impostor');
    expect(resolveEnvironmentRenderClass(asset({ category: 'rock' }))).toBe('ground-prop');
    expect(resolveEnvironmentRenderClass(asset({ category: 'magical' }))).toBe('fx-decorated-prop');
    expect(resolveEnvironmentRenderClass(asset({ renderClass: 'upright-billboard' }))).toBe('upright-billboard');
  });

  it('selects all eight camera-relative impostor views with stable boundary hysteresis', () => {
    const step = Math.PI / 4;
    expect(Array.from({ length: 8 }, (_, index) => resolveEnvironmentDirection(index * step)))
      .toEqual(['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']);
    expect(resolveEnvironmentDirection(step / 2 + 0.04, 's')).toBe('s');
    expect(resolveEnvironmentDirection(step / 2 + 0.12, 's')).toBe('se');
  });

  it('keeps direction renderer-local and independent of animation phase', () => {
    const angle = cameraRelativeEnvironmentAngle(10, 0, 0, 0);
    expect(resolveEnvironmentDirection(angle)).toBe('e');
    expect(resolveEnvironmentDirection(angle + Math.PI)).toBe('w');
  });

  it('uses architecture-configured near, mid, and far LOD boundaries', () => {
    expect(resolveEnvironmentLod(5, 12, 22)).toBe('near');
    expect(resolveEnvironmentLod(12, 12, 22)).toBe('mid');
    expect(resolveEnvironmentLod(22, 12, 22)).toBe('far');
  });

  it('requires explicit presentation metadata for version-2 production assets', () => {
    const manifest = structuredClone(manifestJson) as Record<string, unknown>;
    manifest.version = 2;
    const collisions = new Set(WORLD_TRAVERSAL.blockers.map((blocker) => blocker.id));
    expect(validateEnvironmentManifest(manifest, collisions).errors)
      .toContain('terrain.grass-01 production assets require renderClass, groundAnchor, and provenance.');
  });

  it('prefers eight authored Broadleaf v2 directions without mirroring or fallback', () => {
    const broadleaf = WILDS_ENVIRONMENT_MANIFEST!.assets.find((candidate) => candidate.id === 'tree.broadleaf')!;
    expect(broadleaf.assetVersion).toBe(2);
    expect(broadleaf.renderClass).toBe('directional-impostor');
    expect(broadleaf.directionalViews).toEqual({ authored: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'], mirrorApproved: false });
    expect(Object.keys(broadleaf.animation!.directions!).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(Object.values(broadleaf.animation!.directions!).every((direction) => direction.provenance === 'authored')).toBe(true);
    expect(broadleaf.groundAnchor).toEqual({ x: 0.5, y: 0.8 });
  });

  it('keeps normalized animation phase continuous when direction frame counts differ', () => {
    const broadleaf = WILDS_ENVIRONMENT_MANIFEST!.assets.find((candidate) => candidate.id === 'tree.broadleaf')!;
    const phase = environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-a', 2.75, true);
    expect(environmentFrameForPhase(phase, 25)).toBe(Math.floor(phase * 25));
    expect(environmentFrameForPhase(phase, 17)).toBe(Math.floor(phase * 17));
    expect(environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-a', 2.75, true)).toBe(phase);
  });

  it('assigns deterministic but asynchronous phase offsets to separate tree instances', () => {
    const broadleaf = WILDS_ENVIRONMENT_MANIFEST!.assets.find((candidate) => candidate.id === 'tree.broadleaf')!;
    expect(environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-a', 1, true))
      .not.toBe(environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-b', 1, true));
  });
});
