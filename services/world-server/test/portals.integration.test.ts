// Native Colyseus/WebSocket test. Prepared locally; requires a permitted socket-capable runner.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { createAppConfig } from '../src/app.config.js';
import { PORTAL_MESSAGE, PORTAL_RESULT_MESSAGE, WORLD_ROOM_NAME } from '../src/protocol.js';
import type { WorldRoom } from '../src/rooms/WorldRoom.js';
import { createTestTicket, TEST_JOIN_SECRET, TEST_USER_TWO } from './ticketFixture.js';

describe('native connected-area transport', () => {
  let server: ColyseusTestServer;
  beforeAll(async () => { server = await boot(createAppConfig({ NODE_ENV: 'test', WORLD_ALLOWED_ORIGINS: 'http://localhost:5173', WORLD_JOIN_SECRET: TEST_JOIN_SECRET })); });
  afterAll(async () => { await server.cleanup(); await server.shutdown(); });
  it('travels one authenticated player while the second stays in Grove, then reconnects in Hollow', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const first = await server.connectTo(room, { ticket: createTestTicket() });
    const second = await server.connectTo(room, { ticket: createTestTicket({ sub: TEST_USER_TWO }) });
    const player = room.state.players.get(first.sessionId)!;
    // Synthetic server fixture position, never a browser-supplied teleport.
    player.x = 880; player.y = 270;
    const result = first.waitForMessage(PORTAL_RESULT_MESSAGE);
    first.send(PORTAL_MESSAGE, { requestId: randomUUID(), portalId: 'grove-to-hollow' });
    await expect(result).resolves.toMatchObject({ status: 'success', mapId: 'wilds-town' });
    await room.waitForNextPatch();
    expect(first.state.players.get(first.sessionId)).toMatchObject({ mapId: 'wilds-town', x: 160, y: 270 });
    expect(second.state.players.get(second.sessionId)?.mapId).toBe('wilds-exploration');
    expect(room.state.npcs.size).toBe(2); expect(room.state.players.size).toBe(2);
    first.reconnection.minUptime = 0; first.reconnection.maxDelay = 25;
    const reconnected = new Promise<void>((resolve) => first.onReconnect(resolve));
    first.connection.close(); await reconnected;
    expect(room.state.players.get(first.sessionId)?.mapId).toBe('wilds-town');
    await first.leave(true); await second.leave(true);
  });
  it('rejects a far portal and protocol-one credentials', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    await expect(server.connectTo(room, { ticket: createTestTicket({ protocol: 1 }) })).rejects.toThrow();
    const client = await server.connectTo(room, { ticket: createTestTicket() });
    const result = client.waitForMessage(PORTAL_RESULT_MESSAGE);
    client.send(PORTAL_MESSAGE, { requestId: randomUUID(), portalId: 'grove-to-hollow' });
    await expect(result).resolves.toMatchObject({ status: 'out_of_range' });
    expect(room.state.players.get(client.sessionId)?.mapId).toBe('wilds-exploration');
    await client.leave(true);
  });
});
