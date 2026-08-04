import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { createAppConfig } from '../src/app.config.js';
import { COMPANION_REFRESH_MESSAGE, MOVEMENT_MESSAGE, PROTOCOL_ERROR_MESSAGE, WORLD_ROOM_NAME } from '../src/protocol.js';
import type { WorldRoom } from '../src/rooms/WorldRoom.js';
import { createTestTicket, TEST_JOIN_SECRET, TEST_USER_TWO } from './ticketFixture.js';

describe('WorldRoom integration', () => {
  let server: ColyseusTestServer;

  beforeAll(async () => {
    server = await boot(createAppConfig({
      NODE_ENV: 'test', WORLD_ALLOWED_ORIGINS: 'http://localhost:5173', WORLD_LOG_LEVEL: 'info',
      WORLD_JOIN_SECRET: TEST_JOIN_SECRET
    }));
  });
  afterAll(async () => server.shutdown());

  it('synchronizes two clients and applies authoritative movement', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const first = await server.connectTo(room, { ticket: createTestTicket() });
    const second = await server.connectTo(room, { ticket: createTestTicket({
      sub: TEST_USER_TWO,
      companion: { present: true, name: 'Ember', kind: 'guardian', availability: 'available' }
    }) });
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(2);
    expect(room.state.players.get(first.sessionId)?.companionName).toBe('Lumi');
    expect(room.state.players.get(second.sessionId)?.companionName).toBe('Ember');
    const before = room.state.players.get(first.sessionId)!.x;
    const received = room.waitForMessage(MOVEMENT_MESSAGE);
    first.send(MOVEMENT_MESSAGE, { sequence: 1, x: 1, y: 0 });
    await received;
    await room.waitForNextSimulationTick();
    expect(room.state.players.get(first.sessionId)!.x).toBeGreaterThan(before);
    expect(room.state.players.has(second.sessionId)).toBe(true);
    const refreshed = room.waitForMessage(COMPANION_REFRESH_MESSAGE);
    first.send(COMPANION_REFRESH_MESSAGE, { ticket: createTestTicket({
      companion: { present: true, name: 'Nova', kind: 'spark', availability: 'available' }
    }) });
    await refreshed;
    expect(room.state.players.get(first.sessionId)?.companionName).toBe('Nova');
    await first.leave(true);
    await second.leave(true);
  });

  it('supports an authenticated player with no active companion', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const client = await server.connectTo(room, { ticket: createTestTicket({
      companion: { present: false, name: '', kind: '', availability: 'unavailable' }
    }) });
    expect(room.state.players.get(client.sessionId)).toMatchObject({
      companionPresent: false, companionStatus: 'unavailable'
    });
    await client.leave(true);
  });

  it('reconnects a dropped client into the same authoritative session', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const client = await server.connectTo(room, { ticket: createTestTicket() });
    const sessionId = client.sessionId;
    client.reconnection.minUptime = 0;
    client.reconnection.maxDelay = 25;
    const reconnected = new Promise<void>((resolve) => client.onReconnect(resolve));

    client.connection.close();
    await reconnected;

    expect(client.sessionId).toBe(sessionId);
    expect(room.state.players.size).toBe(1);
    expect(room.state.players.get(sessionId)?.connected).toBe(true);
    await client.leave(true);
  });

  it('rejects malformed and excessive movement messages', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    const client = await server.connectTo(room, { ticket: createTestTicket() });
    const malformed = client.waitForMessage(PROTOCOL_ERROR_MESSAGE);
    client.send(MOVEMENT_MESSAGE, { sequence: 1, x: 'right', y: 0 });
    await expect(malformed).resolves.toMatchObject({ code: 'malformed_message' });
    const limited = client.waitForMessage(PROTOCOL_ERROR_MESSAGE);
    for (let sequence = 2; sequence < 30; sequence += 1) {
      client.send(MOVEMENT_MESSAGE, { sequence, x: 0, y: 0 });
    }
    await expect(limited).resolves.toMatchObject({ code: 'rate_limited' });
    expect(client.state.players.has(client.sessionId)).toBe(true);
    await client.leave(true).catch(() => undefined);
  });

  it('rejects missing, expired, malformed, and impersonated joins', async () => {
    const room = await server.createRoom<WorldRoom>(WORLD_ROOM_NAME);
    await expect(server.connectTo(room, {})).rejects.toThrow();
    await expect(server.connectTo(room, { ticket: 'malformed' })).rejects.toThrow();
    const now = Math.floor(Date.now() / 1000);
    await expect(server.connectTo(room, {
      ticket: createTestTicket({ iat: now - 50, exp: now - 1 }, now - 50)
    })).rejects.toThrow();
    await expect(server.connectTo(room, {
      ticket: createTestTicket(), userId: TEST_USER_TWO
    })).rejects.toThrow();
  });
});
