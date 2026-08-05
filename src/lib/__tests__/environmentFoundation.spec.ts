import { describe, expect, it, vi } from 'vitest';
import manifestJson from '../game/environment/wilds-exploration.environment.json';
import {
  deterministicDecoration,
  resolveEnvironmentAsset,
  validateEnvironmentManifest,
  visibleAtQuality,
  type EnvironmentManifest
} from '../game/environment/contract';
import { WORLD_TRAVERSAL } from '../game/traversal';
import { SharedEnvironmentResources } from '../game/renderers/three/environmentResources';
import { createEnvironmentWorld } from '../game/renderers/three/environmentWorld';
import { ObstructionFadeController } from '../game/renderers/three/obstruction';

const collisionIds = new Set(WORLD_TRAVERSAL.blockers.map((blocker) => blocker.id));
const manifest = validateEnvironmentManifest(manifestJson, collisionIds).manifest!;

describe('world environment foundation', () => {
  it('validates the bundled renderer-neutral manifest', () => {
    const result = validateEnvironmentManifest(manifestJson, collisionIds);
    expect(result.errors).toEqual([]);
    expect(result.manifest?.units).toBe('server');
  });

  it('keeps visual prop placement aligned to authoritative collision without defining collision', () => {
    const collisionRefs = manifestJson.props.map((prop) => prop.collisionRef).sort();
    expect(collisionRefs).toEqual([...collisionIds].sort());
    expect(manifestJson.props.every((prop) => !('radius' in prop) && !('collisionShape' in prop))).toBe(true);
  });

  it('generates stable renderer-local decoration from a seed', () => {
    const field = manifestJson.decorations[0]!;
    expect(deterministicDecoration(field)).toEqual(deterministicDecoration(field));
    expect(deterministicDecoration({ ...field, seed: field.seed + 1 })).not.toEqual(deterministicDecoration(field));
  });

  it('resolves missing production billboards to an explicit prototype fallback', () => {
    const manifest = structuredClone(manifestJson) as unknown as EnvironmentManifest;
    manifest.assets.push({
      id: 'tree-production', kind: 'prop', status: 'production', layer: 'foreground', renderer: 'billboard',
      width: 256, height: 384, pivot: { x: 0.5, y: 1 }, fallbackAssetId: 'tree-prototype',
      obstruction: true, quality: ['full', 'reduced', 'minimum']
    });
    expect(resolveEnvironmentAsset(manifest, 'tree-production')?.id).toBe('tree-prototype');
  });

  it('rejects malformed or gameplay-bearing visual metadata', () => {
    const malformed = structuredClone(manifestJson) as unknown as Record<string, unknown>;
    const props = malformed.props as Array<Record<string, unknown>>;
    props[0]!.radius = 100;
    const result = validateEnvironmentManifest(malformed, collisionIds);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('props[0] must not define collision geometry.');
  });

  it('uses explicit quality visibility instead of mutating gameplay objects', () => {
    const flower = manifest.assets.find((asset) => asset.id === 'flower-prototype')!;
    const moonberry = manifest.assets.find((asset) => asset.id === 'moonberry-prototype')!;
    expect(visibleAtQuality(flower, 'full')).toBe(true);
    expect(visibleAtQuality(flower, 'minimum')).toBe(false);
    expect(visibleAtQuality(moonberry, 'minimum')).toBe(true);
  });

  it('shares GPU-style resources and disposes each resource exactly once', () => {
    const resources = new SharedEnvironmentResources();
    const dispose = vi.fn();
    const first = resources.acquire('tree', () => ({ dispose }));
    const second = resources.acquire('tree', () => ({ dispose: vi.fn() }));
    expect(second).toBe(first);
    expect(resources.size).toBe(1);
    resources.dispose();
    resources.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('constructs aligned obstruction registrations and cleans repeated worlds safely', () => {
    const first = createEnvironmentWorld();
    const second = createEnvironmentWorld();
    expect(first.obstructables.map((item) => item.id).sort()).toEqual([...collisionIds].sort());
    expect(first.metrics.sharedResources).toBeGreaterThan(0);
    expect(first.metrics.drawCalls).toBeLessThan(20);
    first.setQuality('minimum');
    first.update(1);
    first.dispose();
    first.dispose();
    second.dispose();
    expect(first.root.children).toHaveLength(0);
    expect(second.root.children).toHaveLength(0);
  });

  it('keeps environment props compatible with obstruction fading', () => {
    const environment = createEnvironmentWorld();
    const registration = environment.obstructables[0]!;
    const fader = new ObstructionFadeController();
    const faded = fader.update([registration.id], new Set([registration.id]), 1)[0]!;
    registration.setOpacity?.(faded.opacity);
    expect(Number(registration.root.userData.environmentOpacity)).toBeLessThan(1);
    environment.dispose();
  });
});
