import { describe, expect, it } from 'vitest';
import manifestJson from '../game/environment/wilds-exploration.environment.json';
import { environmentAnimationVariation, validateEnvironmentManifest, type EnvironmentAssetDefinition } from '../game/environment/contract';
import {
  anchoredPlaneTranslation,
  cameraForwardEnvironmentAngle,
  cameraRelativeEnvironmentAngle,
  cylindricalBillboardYaw,
  horizontalEnvironmentDistance,
  resolveEnvironmentDirection,
  resolveEnvironmentLod,
  resolveEnvironmentRenderClass
} from '../game/environment/presentation';
import { WORLD_TRAVERSAL } from '../game/traversal';
import {
  ENVIRONMENT_ATLAS_TEXTURE_FLIP_Y, environmentAtlasRegionForFrame, environmentFrameForPhase,
  environmentNormalizedPhaseAt, WILDS_ENVIRONMENT_MANIFEST
} from '../game/renderers/three/environmentWorld';

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

  it('keeps orthographic authored direction invariant under player/camera translation', () => {
    const angle = cameraForwardEnvironmentAngle(0, -1);
    expect(resolveEnvironmentDirection(angle)).toBe('s');
    // Moving camera and player along the viewing ray does not enter this formula.
    expect(cameraForwardEnvironmentAngle(0, -1)).toBe(angle);
    expect(resolveEnvironmentDirection(cameraForwardEnvironmentAngle(-1, 0))).toBe('e');
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

  it('keeps a directional card camera-facing around world-up at every orbit angle', () => {
    for (let degrees = 0; degrees <= 360; degrees += 45) {
      const radians = degrees * Math.PI / 180;
      const cameraX = Math.sin(radians) * 10;
      const cameraZ = Math.cos(radians) * 10;
      const yaw = cylindricalBillboardYaw(cameraX, cameraZ, 0, 0);
      const normal = { x: Math.sin(yaw), z: Math.cos(yaw) };
      expect(normal.x * cameraX + normal.z * cameraZ).toBeCloseTo(10, 8);
    }
  });

  it('ignores camera pitch/elevation for billboard yaw and environment LOD', () => {
    const lowPitchYaw = cylindricalBillboardYaw(6, 8, 0, 0);
    const highPitchYaw = cylindricalBillboardYaw(6, 8, 0, 0);
    expect(highPitchYaw).toBe(lowPitchYaw);
    expect(horizontalEnvironmentDistance(6, 8, 0, 0)).toBe(10);
  });

  it('places the declared image-space ground anchor at the rotating plane origin', () => {
    const translation = anchoredPlaneTranslation(4.3, 4.3, { x: 0.5, y: 0.8 });
    const anchorBeforeTranslation = { x: (0.5 - 0.5) * 4.3, y: (0.5 - 0.8) * 4.3 };
    expect(anchorBeforeTranslation.x + translation.x).toBeCloseTo(0, 10);
    expect(anchorBeforeTranslation.y + translation.y).toBeCloseTo(0, 10);
  });

  it('changes atlas UV regions as animation advances and loops without losing phase', () => {
    expect(ENVIRONMENT_ATLAS_TEXTURE_FLIP_Y).toBe(true);
    expect(environmentAtlasRegionForFrame(0, 25, 5)).toEqual({ x: 0, y: 0.8, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(1, 25, 5)).toEqual({ x: 0.2, y: 0.8, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(4, 25, 5)).toEqual({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(5, 25, 5)).toEqual({ x: 0, y: 0.6, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(6, 25, 5)).toEqual({ x: 0.2, y: 0.6, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(10, 25, 5)).toEqual({ x: 0, y: 0.4, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(20, 25, 5)).toEqual({ x: 0, y: 0, width: 0.2, height: 0.2 });
    expect(environmentAtlasRegionForFrame(24, 25, 5)).toEqual({ x: 0.8, y: 0, width: 0.2, height: 0.2 });
    const broadleaf = WILDS_ENVIRONMENT_MANIFEST!.assets.find((candidate) => candidate.id === 'tree.broadleaf')!;
    const variation = environmentAnimationVariation('phase-loop', broadleaf.animation!.frameCount, broadleaf.animation!.speedVariation);
    const calm = broadleaf.animation!.calmSeconds![0] +
      (broadleaf.animation!.calmSeconds![1] - broadleaf.animation!.calmSeconds![0]) *
      ((variation.startFrame + 1) / broadleaf.animation!.frameCount);
    const cycleSeconds = broadleaf.animation!.frameCount / broadleaf.animation!.fps + calm;
    expect(environmentNormalizedPhaseAt(broadleaf, 'phase-loop', 0.5, true))
      .toBeCloseTo(environmentNormalizedPhaseAt(broadleaf, 'phase-loop', 0.5 + cycleSeconds / variation.playbackRate, true), 8);
  });

  it('assigns deterministic but asynchronous phase offsets to separate tree instances', () => {
    const broadleaf = WILDS_ENVIRONMENT_MANIFEST!.assets.find((candidate) => candidate.id === 'tree.broadleaf')!;
    expect(environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-a', 1, true))
      .not.toBe(environmentNormalizedPhaseAt(broadleaf, 'broadleaf-review-b', 1, true));
  });
});
