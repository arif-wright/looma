import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { createAppConfig } from '../src/app.config.js';
import { GATHER_MESSAGE, GATHER_RESULT_MESSAGE, WORLD_ROOM_NAME, type GatherResult } from '../src/protocol.js';
import type {
  GatherPersistenceResult, LoadedWorldState, SaveWorldStateResult, WorldPersistence
} from '../src/persistence/worldPersistence.js';
import type { WorldMapDefinition } from '../src/world/maps.js';
import type { WorldRoom } from '../src/rooms/WorldRoom.js';
import { createTestTicket, TEST_JOIN_SECRET, TEST_USER_ONE, TEST_USER_TWO } from './ticketFixture.js';

class MemoryGatherPersistence implements WorldPersistence {
  readonly discoveries = new Map<string, Set<string>>();
  readonly inventory = new Map<string, number>();
  readonly journalEntries = new Map<string, number>();
  readonly events = new Map<string, GatherPersistenceResult>();
  private readonly lastGather = new Map<string, number>();
  private lock = Promise.resolve();

  async load(userId: string, map: WorldMapDefinition): Promise<LoadedWorldState> {
    return {
      position: { ...map.spawn }, stateVersion: 1, restored: true,
      discoveries: new Set(this.discoveries.get(userId) ?? [])
    };
  }
  async save(): Promise<SaveWorldStateResult> { return { ok: true, stateVersion: 2 }; }
  async discover(args: { userId: string; landmarkKey: string }) {
    const found = this.discoveries.get(args.userId) ?? new Set<string>();
    const newlyDiscovered = !found.has(args.landmarkKey);
    found.add(args.landmarkKey);
    this.discoveries.set(args.userId, found);
    return { newlyDiscovered };
  }
  async gather(args: { userId: string; idempotencyKey: string }): Promise<GatherPersistenceResult> {
    let release!: () => void;
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const eventKey = `${args.userId}:${args.idempotencyKey}`;
      const existing = this.events.get(eventKey);
      if (existing) return { ...existing, replayed: true };
      const current = this.inventory.get(args.userId) ?? 0;
      let result: GatherPersistenceResult;
      if (current >= 20) {
        result = {
          status: 'inventory_full', itemTitle: 'Moonberry', quantity: 0,
          cooldownUntil: null, reaction: null, replayed: false
        };
      } else if (this.lastGather.has(args.userId)) {
        result = {
          status: 'cooldown', itemTitle: 'Moonberry', quantity: 0,
          cooldownUntil: new Date(Date.now() + 300_000).toISOString(), reaction: null, replayed: false
        };
      } else {
        this.inventory.set(args.userId, current + 1);
        this.lastGather.set(args.userId, Date.now());
        const reaction = args.userId === TEST_USER_TWO ? null : 'Lumi watches the moonlight gather on the berry.';
        if (reaction) this.journalEntries.set(args.userId, 1);
        result = {
          status: 'success', itemTitle: 'Moonberry', quantity: 1,
          cooldownUntil: new Date(Date.now() + 300_000).toISOString(), reaction,
          inventoryHref: '/app/inventory', replayed: false
        };
      }
      this.events.set(eventKey, result);
      return result;
    } finally { release(); }
  }
}

const request = (requestId = crypto.randomUUID()) => ({ requestId, nodeKey: 'moonberry-bush' as const });
const waitGather = (client: { waitForMessage: (type: string) => Promise<unknown> }) =>
  client.waitForMessage(GATHER_RESULT_MESSAGE) as Promise<GatherResult>;

describe('Moonberry gathering integration', () => {
  let server: ColyseusTestServer;
  let persistence: MemoryGatherPersistence;

  beforeAll(async () => {
    persistence = new MemoryGatherPersistence();
    server = await boot(createAppConfig({
      NODE_ENV: 'test', WORLD_ALLOWED_ORIGINS: 'http://localhost:5173',
      WORLD_LOG_LEVEL: 'info', WORLD_JOIN_SECRET: TEST_JOIN_SECRET
    }, { persistence }));
  });
  afterAll(async () => server.shutdown());

  const connectAtNode = async (userId = TEST_USER_ONE, noCompanion = false) => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const client = await server.connectTo(room, { ticket: createTestTicket({
      sub: userId,
      ...(noCompanion ? { companion: { present: false, name: '', kind: '', availability: 'unavailable' } } : {})
    }) });
    room.state.players.get(client.sessionId)!.x = 800;
    room.state.players.get(client.sessionId)!.y = 120;
    await room.waitForNextSimulationTick();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { room, client };
  };

  it('records discovery, grants one unified item, and writes one companion journal reaction', async () => {
    const { client } = await connectAtNode();
    const result = waitGather(client);
    client.send(GATHER_MESSAGE, request());
    await expect(result).resolves.toMatchObject({ status: 'success', itemTitle: 'Moonberry', quantity: 1 });
    expect(persistence.discoveries.get(TEST_USER_ONE)).toContain('moonberry-grove');
    expect(persistence.inventory.get(TEST_USER_ONE)).toBe(1);
    expect(persistence.journalEntries.get(TEST_USER_ONE)).toBe(1);
    await client.leave(true);
  });

  it('rejects out-of-range and client-selected reward fields', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const outClient = await server.connectTo(room, { ticket: createTestTicket() });
    let result = waitGather(outClient);
    outClient.send(GATHER_MESSAGE, request());
    await expect(result).resolves.toMatchObject({ status: 'out_of_range' });
    await outClient.leave(true);

    const connected = await connectAtNode();
    result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, { ...request(), rewardItemKey: 'chapter-bond-sigil' });
    await expect(result).resolves.toMatchObject({ status: 'failure' });
    await connected.client.leave(true);
  });

  it('makes duplicate and reconnect replay delivery idempotent', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    const operation = request();
    let connected = await connectAtNode(userId);
    let result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, operation);
    await expect(result).resolves.toMatchObject({ status: 'success', replayed: false });
    result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, operation);
    await expect(result).resolves.toMatchObject({ status: 'success', replayed: true });
    await connected.client.leave(true);
    connected = await connectAtNode(userId);
    result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, operation);
    await expect(result).resolves.toMatchObject({ status: 'success', replayed: true });
    expect(persistence.inventory.get(userId)).toBe(1);
    await connected.client.leave(true);
  });

  it('serializes concurrent sessions and enforces cooldown', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const first = await connectAtNode(userId);
    const second = await connectAtNode(userId);
    const firstResult = waitGather(first.client);
    const secondResult = waitGather(second.client);
    first.client.send(GATHER_MESSAGE, request());
    second.client.send(GATHER_MESSAGE, request());
    const statuses = [(await firstResult).status, (await secondResult).status].sort();
    expect(statuses).toEqual(['cooldown', 'success']);
    expect(persistence.inventory.get(userId)).toBe(1);
    await first.client.leave(true);
    await second.client.leave(true);
  });

  it('supports inventory-full and no-active-companion outcomes', async () => {
    const fullUser = '55555555-5555-4555-8555-555555555555';
    persistence.inventory.set(fullUser, 20);
    let connected = await connectAtNode(fullUser);
    let result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, request());
    await expect(result).resolves.toMatchObject({ status: 'inventory_full', quantity: 0 });
    await connected.client.leave(true);

    connected = await connectAtNode(TEST_USER_TWO, true);
    result = waitGather(connected.client);
    connected.client.send(GATHER_MESSAGE, request());
    await expect(result).resolves.toMatchObject({ status: 'success', reaction: null });
    expect(persistence.inventory.get(TEST_USER_TWO)).toBe(1);
    expect(persistence.journalEntries.has(TEST_USER_TWO)).toBe(false);
    await connected.client.leave(true);
  });
});
