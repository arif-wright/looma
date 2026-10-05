import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getWorldArea } from '$lib/game/areas';
import type { PlayerSnapshot, WorldSnapshot } from '$lib/game/protocol';
import { areaInteraction, playerTransitionKey, visibleAreaRoster } from '$lib/game/renderers/three/areaPresentation';
import { areaEnvironmentManifest, createAreaEnvironment } from '$lib/game/renderers/three/areaEnvironment';
import { WILDS_ENVIRONMENT_MANIFEST } from '$lib/game/renderers/three/environmentWorld';
import { validateEnvironmentManifest } from '$lib/game/environment/contract';
import { serverToWorld } from '$lib/game/renderers/three/math';

const player = (values: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  x: 180, y: 270, connected: true, acknowledgedSequence: 0, colorIndex: 0,
  displayName: 'Explorer', handle: '', playerBody: 'male', companionPresent: false,
  companionName: '', companionKind: '', companionStatus: 'idle', companionRevision: 0, ...values
});

describe('Three connected areas', () => {
  it('filters both entity collections to the local area without treating residents as players', () => {
    const snapshot: WorldSnapshot = {
      localPlayerId: 'local', tick: 1,
      players: new Map([['local', player()], ['hollow', player({ mapId: 'wilds-town' })]]),
      npcs: new Map([
        ['rowan', { id: 'rowan', mapId: 'wilds-exploration', name: 'Rowan', kind: 'resident', playerBody: 'male', x: 200, y: 260, moving: true }],
        ['wren', { id: 'wren', mapId: 'wilds-town', name: 'Wren', kind: 'resident', playerBody: 'female', x: 480, y: 270, moving: false }]
      ])
    };
    expect([...visibleAreaRoster(snapshot, 'wilds-exploration').players.keys()]).toEqual(['local']);
    expect([...visibleAreaRoster(snapshot, 'wilds-exploration').npcs.keys()]).toEqual(['rowan']);
    expect([...visibleAreaRoster(snapshot, 'wilds-town').players.keys()]).toEqual(['hollow']);
    expect([...visibleAreaRoster(snapshot, 'wilds-town').npcs.keys()]).toEqual(['wren']);
    const { npcs: _npcs, ...withoutResidents } = snapshot;
    expect(visibleAreaRoster(withoutResidents, 'wilds-town').npcs.size).toBe(0);
  });

  it('uses authoritative range, area, connection and pause state for interactions', () => {
    const grove = getWorldArea();
    const nearPortal = player({ x: grove.portal.x, y: grove.portal.y });
    expect(areaInteraction(nearPortal, 'connected')).toEqual({ portal: grove.portal, gather: false });
    expect(areaInteraction(player({ x: grove.portal.x - 55, y: grove.portal.y }), 'connected').portal).toBeNull();
    expect(areaInteraction(nearPortal, 'reconnecting')).toEqual({ portal: null, gather: false });
    expect(areaInteraction(nearPortal, 'connected', true).portal).toBeNull();
    expect(areaInteraction(player({ connected: false, x: 880, y: 270 }), 'connected').portal).toBeNull();
    expect(areaInteraction(player({ x: 800, y: 120 }), 'connected').gather).toBe(true);
    expect(areaInteraction(player({ x: 800, y: 120, mapId: 'wilds-town' }), 'connected').gather).toBe(false);
    expect(areaInteraction(undefined, 'connected')).toEqual({ portal: null, gather: false });
    const hollow = getWorldArea('wilds-town');
    expect(areaInteraction(player({ ...hollow.portal, mapId: hollow.id }), 'connected').portal?.id).toBe('hollow-to-grove');
  });

  it('changes the presentation reset key for either map travel or an authoritative teleport revision', () => {
    expect(playerTransitionKey(player())).toBe('wilds-exploration:0');
    expect(playerTransitionKey(player({ transitionRevision: 2 }))).toBe('wilds-exploration:2');
    expect(playerTransitionKey(player({ mapId: 'wilds-town' }))).toBe('wilds-town:0');
  });

  it('preserves the production Grove manifest and gives Hollow its own blocker-aligned geometry', () => {
    const grove = areaEnvironmentManifest(getWorldArea());
    expect(grove).toEqual(WILDS_ENVIRONMENT_MANIFEST);
    expect(grove).not.toBe(WILDS_ENVIRONMENT_MANIFEST);
    const area = getWorldArea('wilds-town');
    const hollow = areaEnvironmentManifest(area);
    expect(hollow.mapId).toBe('wilds-town');
    expect(hollow.interactables).toEqual([]);
    expect(hollow.terrain.pathCenterline).not.toEqual(grove.terrain.pathCenterline);
    expect(validateEnvironmentManifest(hollow, new Set(area.traversal.blockers.map((item) => item.id))).ok).toBe(true);
    for (const prop of hollow.props) {
      const blocker = area.traversal.blockers.find((item) => item.id === prop.collisionRef)!;
      expect({ x: prop.x, y: prop.y }).toEqual({ x: blocker.x, y: blocker.y });
    }
  });

  it('places both portal and cottage artwork at canonical positions and disposes every map independently', () => {
    const area = getWorldArea('wilds-town');
    const hollow = createAreaEnvironment(area);
    const grove = createAreaEnvironment(getWorldArea());
    expect(hollow.root.name).toBe('environment:wilds-town');
    expect(hollow.root.getObjectByName('moonberry-grove-visual')).toBeUndefined();
    expect(grove.root.getObjectByName('moonberry-grove-visual')).toBeTruthy();
    expect(hollow.root.getObjectByName('portal:hollow-to-grove')?.position.x).toBe(serverToWorld(area.portal.x, area.portal.y).x);
    expect(hollow.obstructables.map((item) => item.id).sort()).toEqual(area.traversal.blockers.map((item) => item.id).sort());
    const cottage = hollow.root.getObjectByName('cottage-hollow-west-visual')!.children[0] as THREE.Mesh;
    const dispose = vi.spyOn(cottage.geometry, 'dispose');
    hollow.update(0, new THREE.Vector3(0, 10, 10));
    const count = hollow.metrics.visibleProps;
    hollow.update(1, new THREE.Vector3(0, 10, 10));
    expect(hollow.metrics.visibleProps).toBe(count);
    hollow.dispose();
    hollow.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(hollow.root.children).toHaveLength(0);
    expect(grove.root.children.length).toBeGreaterThan(0);
    grove.dispose();
  });
});
