import { describe, expect, it, vi } from 'vitest';
import { SupabaseWorldPersistence } from '../src/persistence/worldPersistence.js';
import {
  isValidWorldPosition, landmarkAtPosition, restoreWorldPosition, WORLD_MAPS
} from '../src/world/maps.js';

const USER = '11111111-1111-4111-8111-111111111111';
const map = WORLD_MAPS['wilds-exploration'];

describe('world location validation and restore', () => {
  it('rejects invalid coordinates and obsolete map versions', () => {
    expect(isValidWorldPosition(map, { x: Number.NaN, y: 120 })).toBe(false);
    expect(isValidWorldPosition(map, { x: -1, y: 120 })).toBe(false);
    expect(isValidWorldPosition(map, { x: 128, y: 78 })).toBe(false);
    expect(isValidWorldPosition(map, { x: 540, y: 270 })).toBe(true);
    expect(restoreWorldPosition(map, { mapId: map.id, mapVersion: 99, x: 200, y: 200 })).toEqual({
      position: map.spawn, restored: false
    });
  });

  it('keeps the canonical spawn valid and safely rejects persisted prop overlap', () => {
    expect(isValidWorldPosition(map, map.spawn)).toBe(true);
    expect(restoreWorldPosition(map, { mapId: map.id, mapVersion: map.version, x: 608, y: 110 })).toEqual({
      position: map.spawn, restored: false
    });
  });

  it('restores a valid checkpoint and finds only in-range landmarks', () => {
    expect(restoreWorldPosition(map, { mapId: map.id, mapVersion: 1, x: 220, y: 180 })).toEqual({
      position: { x: 220, y: 180 }, restored: true
    });
    expect(landmarkAtPosition(map, { x: 800, y: 120 })?.key).toBe('moonberry-grove');
    expect(landmarkAtPosition(map, { x: 700, y: 120 })).toBeNull();
  });
});

describe('Supabase world RPC adapter', () => {
  it('loads the last checkpoint for reconnect without exposing table writes', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        mapId: map.id, mapVersion: 1, x: 260, y: 180, stateVersion: 4,
        restored: true, discoveries: ['ancient-grove']
      },
      error: null
    });
    const persistence = new SupabaseWorldPersistence({ rpc } as never);
    const first = await persistence.load(USER, map);
    const reconnect = await persistence.load(USER, map);
    expect(first).toMatchObject({ position: { x: 260, y: 180 }, stateVersion: 4, restored: true });
    expect(reconnect.position).toEqual(first.position);
    expect(reconnect.discoveries.has('ancient-grove')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_world_load_state', {
      p_user: USER, p_preferred_map: map.id
    });
  });

  it('treats repeated discovery results idempotently', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { ok: true, newlyDiscovered: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, newlyDiscovered: false }, error: null });
    const persistence = new SupabaseWorldPersistence({ rpc } as never);
    const args = {
      userId: USER, map, landmarkKey: 'ancient-grove', x: 800, y: 120,
      idempotencyKey: 'world:wilds-exploration:1:ancient-grove'
    };
    await expect(persistence.discover(args)).resolves.toEqual({ newlyDiscovered: true });
    await expect(persistence.discover(args)).resolves.toEqual({ newlyDiscovered: false });
  });

  it('parses only allowlisted Moonberry gather outcomes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      status: 'success', itemTitle: 'Moonberry', quantity: 1,
      cooldownUntil: '2026-08-03T12:05:00.000Z', reaction: 'A safe authored reaction.',
      inventoryHref: '/app/inventory', replayed: false
    }, error: null });
    const persistence = new SupabaseWorldPersistence({ rpc } as never);
    await expect(persistence.gather({
      userId: USER, map, nodeKey: 'moonberry-bush', x: 800, y: 120,
      idempotencyKey: 'moonberry:request-id'
    })).resolves.toMatchObject({ status: 'success', quantity: 1, inventoryHref: '/app/inventory' });
    expect(rpc).toHaveBeenCalledWith('fn_world_gather_moonberry', expect.not.objectContaining({
      p_item_id: expect.anything(), p_reward: expect.anything()
    }));
  });
});
