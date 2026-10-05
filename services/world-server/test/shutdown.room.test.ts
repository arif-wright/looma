// Real room methods plus loopback-only Colyseus teardown; no live accounts or database writes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { boot } from '@colyseus/testing';
import { matchMaker } from 'colyseus';
import { createAppConfig } from '../src/app.config.js';
import { WORLD_ROOM_NAME } from '../src/protocol.js';
import { WorldRoom } from '../src/rooms/WorldRoom.js';
import { WORLD_MAPS } from '../src/world/maps.js';
import type { WorldPersistence } from '../src/persistence/worldPersistence.js';
import { createTestTicket, TEST_JOIN_SECRET, TEST_USER_ONE, TEST_USER_TWO } from './ticketFixture.js';

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const loadedState = () => ({
  mapId: 'wilds-exploration' as const, position: { x: 120, y: 120 }, stateVersion: 4,
  discoveries: new Set(['moonberry-grove']), restored: true
});
const persistence = () => ({
  load: vi.fn().mockImplementation(async () => loadedState()),
  save: vi.fn().mockImplementation(async (args) => ({ ok: true, stateVersion: args.expectedStateVersion + 1 })),
  travel: vi.fn().mockImplementation(async (args) => ({ ok: true, stateVersion: args.expectedStateVersion + 1 })),
  discover: vi.fn().mockResolvedValue({ newlyDiscovered: true }),
  gather: vi.fn().mockResolvedValue({ status: 'success', quantity: 1, itemTitle: 'Moonberry', replayed: false })
});
const syntheticClient = (sessionId = 'synthetic-owner', userId = TEST_USER_ONE) => ({
  sessionId, send: vi.fn(), leave: vi.fn(),
  auth: {
    userId, ticketId: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + 45,
    displayName: 'Synthetic explorer', handle: null, playerBody: 'male' as const,
    companion: { present: true, name: 'Echo', kind: 'echo', availability: 'available' as const }
  },
  userData: undefined as any
});

function createRoom(store: WorldPersistence | null = persistence()) {
  const room = new WorldRoom();
  room.setMetadata = vi.fn() as never;
  room.setSimulationInterval = vi.fn() as never;
  room.onMessage = vi.fn() as never;
  room.lock = vi.fn().mockResolvedValue(undefined) as never;
  room.broadcast = vi.fn() as never;
  room.disconnect = vi.fn().mockResolvedValue(undefined) as never;
  room.allowReconnection = vi.fn().mockResolvedValue(undefined) as never;
  room.onCreate({ persistence: store, joinSecret: TEST_JOIN_SECRET });
  const methods = room as any;
  methods.shutdownDrainMs = 100;
  return { room, methods };
}

async function setup(store: WorldPersistence | null = persistence()) {
  const { room, methods } = createRoom(store);
  const client = syntheticClient();
  room.clients.push(client as never);
  await room.onJoin(client as never);
  const player = room.state.players.get(client.sessionId)!;
  return { room, methods, client, player, runtime: client.userData };
}

// Drain only native microtasks; do not accidentally advance the shutdown deadline.
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
const portalRequest = () => ({ requestId: randomUUID(), portalId: 'grove-to-hollow' });
const gatherRequest = () => ({ requestId: randomUUID(), nodeKey: 'moonberry-bush' });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('graceful room shutdown (local lifecycle regression)', () => {
  it.each(['gather', 'portal'] as const)('freezes joins, simulation, movement, companion refresh and %s before draining', async (interaction) => {
    const store = persistence();
    const finalSave = deferred();
    store.save.mockReturnValueOnce(finalSave.promise);
    const { room, methods, client, player, runtime } = await setup(store);
    Object.assign(player, interaction === 'gather' ? { x: 800, y: 155 } : { x: 880, y: 270 });
    runtime.input = { sequence: 8, x: 1, y: 0 };
    const original = { x: player.x, y: player.y, revision: player.companionRevision };

    const shutdown = room.onBeforeShutdown();
    expect(shutdown).toBeInstanceOf(Promise);
    expect(room.lock).toHaveBeenCalledOnce();
    expect(runtime.input).toEqual({ sequence: 8, x: 0, y: 0 });
    methods.handleMovement(client, { sequence: 9, x: -1, y: 0 });
    methods.handleCompanionRefresh(client, { ticket: createTestTicket({
      playerBody: 'female', companion: { present: true, name: 'Changed', kind: 'muse', availability: 'available' }
    }) });
    if (interaction === 'gather') await methods.handleGather(client, gatherRequest());
    else await methods.handlePortal(client, portalRequest());
    methods.simulate(50);

    const lateClient = syntheticClient('late-join', TEST_USER_TWO);
    room.clients.push(lateClient as never);
    await expect(room.onJoin(lateClient as never)).rejects.toThrow();
    expect(room.state.players.has(lateClient.sessionId)).toBe(false);
    expect(store.load).toHaveBeenCalledOnce();
    expect(runtime.input).toEqual({ sequence: 8, x: 0, y: 0 });
    expect(player).toMatchObject({ x: original.x, y: original.y, playerBody: 'male', companionName: 'Echo', companionRevision: original.revision });
    expect(store.gather).not.toHaveBeenCalled();
    expect(store.travel).not.toHaveBeenCalled();
    expect(store.discover).not.toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
    finalSave.resolve({ ok: true, stateVersion: 5 });
    await shutdown;
    expect(room.disconnect).toHaveBeenCalledExactlyOnceWith(4001);
  });

  it('serializes the previous checkpoint and exactly one fresh final save before disconnecting', async () => {
    const store = persistence();
    const oldSave = deferred();
    const finalSave = deferred();
    store.save.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(finalSave.promise);
    const { room, methods, client, player, runtime } = await setup(store);
    player.x = 220; runtime.dirty = true;
    const oldCheckpoint = methods.queueCheckpoint(client, false);
    player.x = 300;
    const shutdown = room.onBeforeShutdown();
    const repeated = room.onBeforeShutdown();
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    expect(room.disconnect).not.toHaveBeenCalled();
    oldSave.resolve({ ok: true, stateVersion: 5 });
    await oldCheckpoint;
    await settle();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ x: 300, expectedStateVersion: 5 }));
    expect(room.disconnect).not.toHaveBeenCalled();
    finalSave.resolve({ ok: true, stateVersion: 6 });
    await Promise.all([shutdown, repeated]);
    await room.onBeforeShutdown();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(room.lock).toHaveBeenCalledOnce();
    expect(room.broadcast).toHaveBeenCalledExactlyOnceWith('server-shutdown', { retry: true });
    expect(room.disconnect).toHaveBeenCalledExactlyOnceWith(4001);
  });

  it('lets an issued portal commit settle, then saves its destination before disconnecting', async () => {
    const store = persistence();
    const oldSave = deferred(); const travel = deferred(); const finalSave = deferred();
    store.save.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(finalSave.promise);
    store.travel.mockReturnValueOnce(travel.promise);
    const { room, methods, client, player, runtime } = await setup(store);
    player.x = 880; player.y = 270; runtime.dirty = true;
    const checkpoint = methods.queueCheckpoint(client, true);
    const travelling = methods.handlePortal(client, portalRequest());
    await settle(); expect(store.travel).not.toHaveBeenCalled();
    oldSave.resolve({ ok: true, stateVersion: 5 });
    await checkpoint; await settle();
    expect(store.travel).toHaveBeenCalledWith(expect.objectContaining({ expectedStateVersion: 5 }));
    const shutdown = room.onBeforeShutdown();
    await settle();
    expect(store.save).toHaveBeenCalledOnce();
    expect(room.disconnect).not.toHaveBeenCalled();
    travel.resolve({ ok: true, stateVersion: 6 });
    await travelling; await settle();
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({
      map: WORLD_MAPS['wilds-town'], x: 160, y: 270, expectedStateVersion: 6
    }));
    expect(player.connected).toBe(false);
    expect(room.disconnect).not.toHaveBeenCalled();
    finalSave.resolve({ ok: true, stateVersion: 7 });
    await shutdown;
    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it('cancels a portal still waiting for a checkpoint when shutdown freezes the room', async () => {
    const store = persistence(); const oldSave = deferred();
    store.save.mockReturnValueOnce(oldSave.promise);
    const { room, methods, client, player, runtime } = await setup(store);
    player.x = 880; player.y = 270; runtime.dirty = true;
    const checkpoint = methods.queueCheckpoint(client, false);
    const travelling = methods.handlePortal(client, portalRequest());
    const shutdown = room.onBeforeShutdown();
    oldSave.resolve({ ok: true, stateVersion: 5 });
    await Promise.all([checkpoint, travelling, shutdown]);
    expect(store.travel).not.toHaveBeenCalled();
    expect(player.mapId).toBe('wilds-exploration');
    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['gather', 'discovery'] as const)('tracks a pending %s write until it settles before disconnecting', async (kind) => {
    const store = persistence(); const write = deferred();
    const { room, methods, client, player, runtime } = await setup(store);
    player.x = 800; player.y = 155;
    let gathering: Promise<void> | undefined;
    if (kind === 'gather') {
      store.gather.mockReturnValueOnce(write.promise);
      gathering = methods.handleGather(client, gatherRequest());
    } else {
      runtime.discoveries.clear();
      store.discover.mockReturnValueOnce(write.promise);
      methods.checkLandmark(client, player);
    }
    await settle();
    expect(kind === 'gather' ? store.gather : store.discover).toHaveBeenCalledOnce();
    const shutdown = room.onBeforeShutdown();
    await settle();
    expect(room.disconnect).not.toHaveBeenCalled();
    write.resolve(kind === 'gather'
      ? { status: 'success', quantity: 1, itemTitle: 'Moonberry', replayed: false }
      : { newlyDiscovered: true });
    await gathering;
    await shutdown;
    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it('does not start a gather after its awaited discovery resolves during shutdown', async () => {
    const store = persistence(); const discovery = deferred();
    const { room, methods, client, player, runtime } = await setup(store);
    player.x = 800; player.y = 155; runtime.discoveries.clear();
    store.discover.mockReturnValueOnce(discovery.promise);
    methods.checkLandmark(client, player);
    const gathering = methods.handleGather(client, gatherRequest());
    const shutdown = room.onBeforeShutdown();
    discovery.resolve({ newlyDiscovered: true });
    await Promise.all([gathering, shutdown]);
    expect(store.gather).not.toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['save', 'travel', 'gather', 'discover'] as const)('bounds a hanging %s and never starts a late checkpoint after disconnect', async (kind) => {
    vi.useFakeTimers();
    const store = persistence(); const write = deferred();
    const { room, methods, client, player, runtime } = await setup(store);
    let outstanding: Promise<void> | undefined;
    if (kind === 'save') {
      store.save.mockReturnValueOnce(write.promise);
      runtime.dirty = true;
      outstanding = methods.queueCheckpoint(client, false);
      player.x = 300; // Requires a fresher checkpoint if the old save resolves while draining.
    } else if (kind === 'travel') {
      player.x = 880; player.y = 270;
      store.travel.mockReturnValueOnce(write.promise);
      outstanding = methods.handlePortal(client, portalRequest());
    } else if (kind === 'gather') {
      player.x = 800; player.y = 155;
      store.gather.mockReturnValueOnce(write.promise);
      outstanding = methods.handleGather(client, gatherRequest());
    } else {
      player.x = 800; player.y = 155; runtime.discoveries.clear();
      store.discover.mockReturnValueOnce(write.promise);
      methods.checkLandmark(client, player);
    }
    await settle();
    const shutdown = room.onBeforeShutdown();
    await settle();
    expect(room.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(101);
    await shutdown;
    expect(room.disconnect).toHaveBeenCalledExactlyOnceWith(4001);
    const savesAtDisconnect = store.save.mock.calls.length;
    await room.onDispose();
    write.resolve(kind === 'gather'
      ? { status: 'success', quantity: 1, itemTitle: 'Moonberry', replayed: false }
      : kind === 'discover' ? { newlyDiscovered: true } : { ok: true, stateVersion: 5 });
    await outstanding; await settle();
    await methods.queueCheckpoint(client, true);
    expect(store.save).toHaveBeenCalledTimes(savesAtDisconnect);
    expect(player.connected).toBe(false);
    expect(room.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'conflict'] as const)('continues teardown after a final checkpoint %s', async (failure) => {
    const store = persistence();
    if (failure === 'reject') store.save.mockRejectedValueOnce(new Error('storage unavailable'));
    else store.save.mockResolvedValueOnce({ ok: false, conflict: true });
    const { room } = await setup(store);
    await room.onBeforeShutdown();
    expect(store.save).toHaveBeenCalledOnce();
    expect(room.disconnect).toHaveBeenCalledExactlyOnceWith(4001);
    await room.onDispose();
  });

  it('does not reserve a reconnect or revive a player while shutdown is pending', async () => {
    const store = persistence(); const finalSave = deferred();
    store.save.mockReturnValueOnce(finalSave.promise);
    const { room, client, player } = await setup(store);
    const shutdown = room.onBeforeShutdown();
    await settle();
    const dropping = room.onDrop(client as never, 4001);
    await expect(Promise.resolve().then(() => room.onReconnect(client as never))).rejects.toThrow();
    expect(player.connected).toBe(false);
    expect(room.allowReconnection).not.toHaveBeenCalled();
    finalSave.resolve({ ok: true, stateVersion: 5 });
    await Promise.all([shutdown, dropping]);
    expect(room.allowReconnection).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledOnce();
  });

  it('replaces a reconnected transport in drain tracking and forgets it on final leave', async () => {
    const { room, methods, client, player, runtime } = await setup();
    // allowReconnection transfers auth/userData to a new Client with the same sessionId.
    const reconnected = syntheticClient(client.sessionId);
    reconnected.auth = client.auth;
    reconnected.userData = runtime;
    room.clients.delete(client as never);
    room.clients.push(reconnected as never);
    player.connected = false;
    room.onReconnect(reconnected as never);
    expect(player.connected).toBe(true);
    expect([...methods.activeClients.values()]).toEqual([reconnected]);
    await room.onLeave(reconnected as never, 4000);
    expect(methods.activeClients.size).toBe(0);
    expect(room.state.players.has(client.sessionId)).toBe(false);
  });

  it('avoids a circular wait through Colyseus shutdown drop, leave and disposal hooks', async () => {
    vi.useFakeTimers();
    const store = persistence(); const save = deferred();
    store.save.mockReturnValueOnce(save.promise);
    const { room, methods, client, runtime } = await setup(store);
    runtime.dirty = true;
    const checkpoint = methods.queueCheckpoint(client, true);
    // Colyseus removes a client from clients before calling onDrop. Shutdown 4001
    // dispatches onDrop, then onLeave, and disconnect resolves only after onDispose.
    room.clients.delete(client as never);
    const oldDrop = room.onDrop(client as never, 1006);
    room.disconnect = vi.fn().mockImplementation(async () => {
      await oldDrop;
      await room.onLeave(client as never, 4001);
      await room.onDispose();
    }) as never;
    const shutdown = room.onBeforeShutdown();
    await vi.advanceTimersByTimeAsync(101);
    await shutdown;
    expect(room.disconnect).toHaveBeenCalledOnce();
    expect(room.state.players.has(client.sessionId)).toBe(false);
    const savesAtDisconnect = store.save.mock.calls.length;
    save.resolve({ ok: true, stateVersion: 5 });
    await checkpoint; await settle();
    expect(store.save).toHaveBeenCalledTimes(savesAtDisconnect);
  });

  it('rejects an in-progress join load after shutdown without saving an uninitialized version', async () => {
    const store = persistence(); const load = deferred();
    store.load.mockReturnValueOnce(load.promise);
    const { room } = createRoom(store);
    const client = syntheticClient(); room.clients.push(client as never);
    const joining = expect(room.onJoin(client as never)).rejects.toThrow();
    const shutdown = room.onBeforeShutdown();
    await settle();
    expect(store.save).not.toHaveBeenCalled();
    await Promise.all([joining, shutdown]);
    // The load may remain unresolved past shutdown; its later result cannot revive the session.
    load.resolve(loadedState());
    await settle();
    expect(room.state.players.has(client.sessionId)).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalledOnce();
  });
});


describe('native Colyseus shutdown teardown (loopback transport)', () => {
  it('closes connected clients before an unconsumed seat expires and then finishes disposal', async () => {
    const server = await boot(createAppConfig({
      NODE_ENV: 'test', WORLD_ALLOWED_ORIGINS: 'http://localhost:5173', WORLD_JOIN_SECRET: TEST_JOIN_SECRET
    }, { persistence: null }));
    try {
      const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
      const client = await server.connectTo(room, { ticket: createTestTicket() });
      client.onMessage('server-shutdown', () => undefined);
      room.seatReservationTimeout = 0.25;
      const reservation = await matchMaker.joinById(room.roomId, {
        ticket: createTestTicket({ sub: TEST_USER_TWO })
      }, { headers: new Headers(), ip: '127.0.0.1' });
      expect(room.hasReservedSeat(reservation.sessionId)).toBe(true);
      const dispose = vi.spyOn(room, 'onDispose');
      const reconnect = vi.spyOn(room, 'allowReconnection');
      const closed = new Promise<number>((resolve) => client.onLeave(resolve));
      let finished = false;
      const shutdown = room.onBeforeShutdown().then(() => { finished = true; });
      expect(await closed).toBe(4001);
      expect(finished).toBe(false);
      expect(dispose).not.toHaveBeenCalled();
      expect(reconnect).not.toHaveBeenCalled();
      // Colyseus keeps an already issued, unconsumed seat until its own finite
      // expiry. The persistence drain deadline is not a total disposal deadline.
      await shutdown;
      expect(finished).toBe(true);
      expect(room.hasReservedSeat(reservation.sessionId)).toBe(false);
      expect(dispose).toHaveBeenCalledOnce();
      expect(room.state.players.size).toBe(0);
    } finally {
      await server.cleanup();
      await server.shutdown();
    }
  });


  it.each(['settled', 'timeout'] as const)('reaches actual room disposal after a %s checkpoint without issuing a reconnect reservation', async (outcome) => {
    const store = persistence(); const save = deferred();
    store.save.mockReturnValueOnce(save.promise);
    const server = await boot(createAppConfig({
      NODE_ENV: 'test', WORLD_ALLOWED_ORIGINS: 'http://localhost:5173', WORLD_JOIN_SECRET: TEST_JOIN_SECRET
    }, { persistence: store }));
    try {
      const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
      const client = await server.connectTo(room, { ticket: createTestTicket() });
      client.onMessage('server-shutdown', () => undefined);
      const methods = room as any;
      methods.shutdownDrainMs = outcome === 'timeout' ? 50 : 1_000;
      const drop = vi.spyOn(room, 'onDrop');
      const leave = vi.spyOn(room, 'onLeave');
      const dispose = vi.spyOn(room, 'onDispose');
      const reconnect = vi.spyOn(room, 'allowReconnection');
      const disconnect = vi.spyOn(room, 'disconnect');
      const closed = new Promise<number>((resolve) => client.onLeave(resolve));
      const shutdown = room.onBeforeShutdown();
      await settle();
      expect(store.save).toHaveBeenCalledOnce();
      expect(disconnect).not.toHaveBeenCalled();
      expect(drop).not.toHaveBeenCalled();
      if (outcome === 'settled') save.resolve({ ok: true, stateVersion: 5 });
      await shutdown;
      expect(await closed).toBe(4001);
      expect(disconnect).toHaveBeenCalledExactlyOnceWith(4001);
      expect(drop).toHaveBeenCalledExactlyOnceWith(expect.anything(), 4001);
      expect(leave).toHaveBeenCalledExactlyOnceWith(expect.anything(), 4001);
      expect(dispose).toHaveBeenCalledOnce();
      expect(reconnect).not.toHaveBeenCalled();
      expect(room.state.players.size).toBe(0);
      save.resolve({ ok: true, stateVersion: 5 });
      await settle();
      expect(store.save).toHaveBeenCalledOnce();
    } finally {
      save.resolve({ ok: true, stateVersion: 5 });
      await server.cleanup();
      await server.shutdown();
    }
  });
});
