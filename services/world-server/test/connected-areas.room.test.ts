// Real WorldRoom methods and Schema objects; synthetic clients/persistence, no sockets or live accounts.
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WorldRoom } from '../src/rooms/WorldRoom.js';
import { WORLD_MAPS } from '../src/world/maps.js';
import type { WorldPersistence } from '../src/persistence/worldPersistence.js';
import { PORTAL_RESULT_MESSAGE, GATHER_RESULT_MESSAGE } from '../src/protocol.js';

const USER = '11111111-1111-4111-8111-111111111111';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => resolve = done); return { promise, resolve }; };
const persistence = () => ({
  load: vi.fn().mockResolvedValue({ mapId: 'wilds-exploration', position: { x: 120, y: 120 }, stateVersion: 4, discoveries: new Set(['moonberry-grove']), restored: true }),
  save: vi.fn().mockImplementation(async (args) => ({ ok: true, stateVersion: args.expectedStateVersion + 1 })),
  travel: vi.fn().mockImplementation(async (args) => ({ ok: true, stateVersion: args.expectedStateVersion + 1 })),
  discover: vi.fn().mockResolvedValue({ newlyDiscovered: true }),
  gather: vi.fn().mockResolvedValue({ status: 'success', quantity: 1, itemTitle: 'Moonberry', replayed: false })
});
async function setup(store: WorldPersistence | null = null) {
  const room = new WorldRoom();
  // The room's networking host/tick registration are outside this direct-method fixture.
  room.setMetadata = vi.fn() as never;
  room.setSimulationInterval = vi.fn() as never;
  room.onMessage = vi.fn() as never;
  room.onCreate({ persistence: store });
  const client = { sessionId: 'synthetic-owner', send: vi.fn(), leave: vi.fn(), auth: { userId: USER, displayName: 'Synthetic explorer', handle: null, playerBody: 'male', companion: { present: true, name: 'Echo', kind: 'echo', availability: 'available' } }, userData: undefined as any };
  room.clients.push(client as never);
  await room.onJoin(client as never);
  const player = room.state.players.get(client.sessionId)!;
  const methods = room as any;
  return { room, client, player, methods, runtime: client.userData };
}
const request = (portalId = 'grove-to-hollow') => ({ requestId: randomUUID(), portalId });

describe('server-owned connected areas (no sockets)', () => {
  it('traverses both ways and ignores client-selected destinations', async () => {
    const { methods, player, client, runtime } = await setup();
    player.x = 880; player.y = 270;
    await methods.handlePortal(client, { ...request(), x: 10, targetMapId: 'unknown' });
    expect(player.mapId).toBe('wilds-exploration');
    await methods.handlePortal(client, request());
    expect(player).toMatchObject({ mapId: 'wilds-town', x: 160, y: 270, transitionRevision: 1 });
    runtime.lastPortalAt = -Infinity;
    player.x = 80;
    await methods.handlePortal(client, request('hollow-to-grove'));
    expect(player).toMatchObject({ mapId: 'wilds-exploration', x: 804, y: 270, transitionRevision: 2 });
  });
  it('rejects far, wrong-map, disconnected and leaving interactions', async () => {
    const { methods, player, client, runtime } = await setup();
    await methods.handlePortal(client, request());
    expect(client.send).toHaveBeenLastCalledWith(PORTAL_RESULT_MESSAGE, expect.objectContaining({ status: 'out_of_range' }));
    player.x = 880; player.y = 270;
    await methods.handlePortal(client, request('hollow-to-grove'));
    player.connected = false; await methods.handlePortal(client, request());
    player.connected = true; runtime.leaving = true; await methods.handlePortal(client, request());
    expect(player.mapId).toBe('wilds-exploration');
  });
  it('replays a duplicate response without bouncing and rate-limits every attempt', async () => {
    const { methods, player, client, runtime } = await setup();
    player.x = 880; player.y = 270; const original = request();
    await methods.handlePortal(client, original);
    player.x = 80;
    await methods.handlePortal(client, original);
    await methods.handlePortal(client, request('hollow-to-grove'));
    expect(player.mapId).toBe('wilds-town');
    expect(player.transitionRevision).toBe(1);
    for (let n = 0; n < 10; n++) await methods.handlePortal(client, { bad: n });
    runtime.lastPortalAt = -Infinity;
    await methods.handlePortal(client, request('hollow-to-grove'));
    expect(client.send).toHaveBeenLastCalledWith(PORTAL_RESULT_MESSAGE, expect.objectContaining({ status: 'cooldown' }));
  });
  it('persists the allowed target through the service-only CAS and resets held input', async () => {
    const store = persistence(); const { methods, player, client, runtime } = await setup(store);
    player.x = 880; player.y = 270; runtime.input = { sequence: 8, x: 1, y: 0 };
    await methods.handlePortal(client, request());
    expect(store.travel).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, map: WORLD_MAPS['wilds-exploration'], portalId: 'grove-to-hollow', x: 880, y: 270, expectedStateVersion: 4 }));
    expect(runtime.input).toEqual({ sequence: 8, x: 0, y: 0 });
    expect(runtime.stateVersion).toBe(5);
    expect(runtime.dirty).toBe(false);
    expect(player.mapId).toBe('wilds-town');
  });
  it('waits for an old-area save before travel and uses its resulting version', async () => {
    const store = persistence(); const save = deferred<any>(); store.save.mockReturnValueOnce(save.promise);
    const { methods, player, client, runtime } = await setup(store);
    player.x = 880; player.y = 270; runtime.dirty = true;
    const saving = methods.queueCheckpoint(client, true); const travelling = methods.handlePortal(client, request());
    await Promise.resolve(); expect(store.travel).not.toHaveBeenCalled();
    methods.handleMovement(client, { sequence: 30, x: -1, y: 0 });
    expect(runtime.input.x).toBe(0);
    save.resolve({ ok: true, stateVersion: 5 }); await saving; await travelling;
    expect(store.travel).toHaveBeenCalledWith(expect.objectContaining({ expectedStateVersion: 5 }));
    expect(runtime.stateVersion).toBe(6);
  });
  it('waits for travel on leave, saves the destination, then removes the player', async () => {
    const store = persistence(); const travel = deferred<any>(); store.travel.mockReturnValueOnce(travel.promise);
    const { methods, player, client, room } = await setup(store);
    player.x = 880; player.y = 270;
    const travelling = methods.handlePortal(client, request()); await Promise.resolve();
    const leaving = room.onLeave(client as never);
    expect(store.save).not.toHaveBeenCalled();
    travel.resolve({ ok: true, stateVersion: 5 }); await travelling; await leaving;
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ map: WORLD_MAPS['wilds-town'], x: 160, y: 270, expectedStateVersion: 5 }));
    expect(room.state.players.size).toBe(0);
  });
  it('retains a committed destination when transport drops during travel', async () => {
    const store = persistence(); const travel = deferred<any>(); store.travel.mockReturnValueOnce(travel.promise);
    const { methods, player, client, room } = await setup(store);
    player.x = 880; player.y = 270;
    const travelling = methods.handlePortal(client, request()); await Promise.resolve();
    player.connected = false;
    travel.resolve({ ok: true, stateVersion: 5 }); await travelling;
    expect(player).toMatchObject({ mapId: 'wilds-town', connected: false, companionStatus: 'reconnecting' });
    room.onReconnect(client as never);
    expect(player).toMatchObject({ mapId: 'wilds-town', connected: true });
  });
  it('aborts before mutation when disconnect happens while waiting for a save', async () => {
    const store = persistence(); const save = deferred<any>(); store.save.mockReturnValueOnce(save.promise);
    const { methods, player, client, runtime } = await setup(store);
    player.x = 880; player.y = 270; runtime.dirty = true;
    const saving = methods.queueCheckpoint(client, true); const travelling = methods.handlePortal(client, request());
    player.connected = false; save.resolve({ ok: true, stateVersion: 5 }); await saving; await travelling;
    expect(store.travel).not.toHaveBeenCalled(); expect(player.mapId).toBe('wilds-exploration');
  });
  it.each(['conflict', 'throw'])('forces fresh authorization after %s instead of guessing durable map', async (failure) => {
    const store = persistence(); if (failure === 'throw') store.travel.mockRejectedValueOnce(new Error('unknown outcome'));
    else store.travel.mockResolvedValueOnce({ ok: false, conflict: true });
    const { methods, player, client, runtime } = await setup(store);
    player.x = 880; player.y = 270; await methods.handlePortal(client, request());
    expect(player.mapId).toBe('wilds-exploration'); expect(runtime.stateVersion).toBe(-1);
    expect(client.leave).toHaveBeenCalledWith(4004, expect.any(String));
    await methods.queueCheckpoint(client, true); expect(store.save).not.toHaveBeenCalled();
  });
  it('removes a resync-closed session without issuing a reconnect reservation', async () => {
    const { room, client, runtime } = await setup(persistence());
    runtime.stateVersion = -1;
    room.allowReconnection = vi.fn() as never;
    await room.onDrop(client as never, 4004);
    expect(room.allowReconnection).not.toHaveBeenCalled();
    expect(room.state.players.has(client.sessionId)).toBe(false);
  });

  it('requests fresh authorization after checkpoint CAS conflict instead of freezing invisibly', async () => {
    const store = persistence(); store.save.mockResolvedValueOnce({ ok: false, conflict: true });
    const { methods, client, runtime } = await setup(store);
    runtime.dirty = true; await methods.queueCheckpoint(client, true);
    expect(client.leave).toHaveBeenCalledOnce(); expect(client.leave).toHaveBeenCalledWith(4004, expect.any(String));
    methods.handleMovement(client, { sequence: 5, x: 1, y: 0 });
    await methods.queueCheckpoint(client, true);
    expect(runtime.input.x).toBe(0); expect(store.save).toHaveBeenCalledOnce();
  });

  it('forces one fresh checkpoint after an older in-flight position save', async () => {
    const store = persistence(); const save = deferred<any>(); store.save.mockReturnValueOnce(save.promise);
    const { methods, player, client, runtime } = await setup(store);
    runtime.dirty = true; player.x = 220;
    const first = methods.queueCheckpoint(client, false); player.x = 300;
    const forced = methods.queueCheckpoint(client, true); save.resolve({ ok: true, stateVersion: 5 });
    await first; await forced;
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ x: 300, expectedStateVersion: 5 }));
  });
  it('fresh join restores the saved supported map and qualifies its discoveries', async () => {
    const store = persistence(); store.load.mockResolvedValueOnce({ mapId: 'wilds-town', position: { x: 300, y: 270 }, stateVersion: 7, discoveries: new Set(['town-well']), restored: true });
    const { player, runtime } = await setup(store);
    expect(player).toMatchObject({ mapId: 'wilds-town', x: 300, y: 270 });
    expect(runtime.discoveries).toEqual(new Set(['wilds-town:town-well']));
  });
  it('keeps gather unavailable outside Grove and while a portal is pending', async () => {
    const store = persistence(); const { methods, player, client, runtime } = await setup(store);
    player.mapId = 'wilds-town'; player.x = 800; player.y = 155;
    await methods.handleGather(client, { requestId: randomUUID(), nodeKey: 'moonberry-bush' });
    expect(client.send).toHaveBeenLastCalledWith(GATHER_RESULT_MESSAGE, expect.objectContaining({ status: 'out_of_range' }));
    player.mapId = 'wilds-exploration'; runtime.transitionInFlight = Promise.resolve();
    await methods.handleGather(client, { requestId: randomUUID(), nodeKey: 'moonberry-bush' });
    expect(store.gather).not.toHaveBeenCalled();
  });
  it('captures gathering coordinates before waiting for discovery and excludes travel meanwhile', async () => {
    const store = persistence(); const discovery = deferred<void>(); const { methods, player, client, runtime } = await setup(store);
    player.x = 800; player.y = 155;
    runtime.discoveryInFlight.set('wilds-exploration:moonberry-grove', discovery.promise);
    const gathering = methods.handleGather(client, { requestId: randomUUID(), nodeKey: 'moonberry-bush' });
    player.x = 880; player.y = 270; await methods.handlePortal(client, request());
    expect(store.travel).not.toHaveBeenCalled(); discovery.resolve(); await gathering;
    expect(store.gather).toHaveBeenCalledWith(expect.objectContaining({ map: WORLD_MAPS['wilds-exploration'], x: 800, y: 155 }));
  });
  it('advances NPCs independently while keeping them outside the player roster', async () => {
    const { room, methods, client } = await setup();
    expect(room.state.npcs.size).toBe(2); expect(room.state.players.size).toBe(1);
    const x = room.state.npcs.get('rowan')!.x;
    for (let n = 0; n < 60; n++) methods.simulate(50);
    expect(room.state.npcs.get('rowan')!.x).not.toBe(x);
    await room.onLeave(client as never); expect(room.state.players.size).toBe(0); expect(room.state.npcs.size).toBe(2);
  });
});
