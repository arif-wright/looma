import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldConnection } from '$lib/game/worldConnection';
import type { ConnectionStatus, GatherResult } from '$lib/game/protocol';

type Handler = (...args: any[]) => void;

const signal = () => {
  const handlers: Handler[] = [];
  return Object.assign((handler: Handler) => handlers.push(handler), {
    emit: (...args: any[]) => handlers.forEach((handler) => handler(...args))
  });
};

const makeRoom = () => {
  const onDrop = signal();
  const onReconnect = signal();
  const onLeave = signal();
  const onError = signal();
  const onStateChange = signal();
  const messages = new Map<string, Handler>();
  return {
    sessionId: 'player-one',
    reconnectionToken: 'room:reconnect-token',
    reconnection: { minUptime: 5_000, maxRetries: 15, maxDelay: 5_000, isReconnecting: false },
    state: { tick: 1, players: { forEach: () => undefined } },
    onDrop,
    onReconnect,
    onLeave,
    onError,
    onStateChange,
    onMessage: vi.fn((type: string, handler: Handler) => messages.set(type, handler)),
    send: vi.fn(),
    leave: vi.fn(async () => 1000),
    emitMessage: (type: string, payload: unknown) => messages.get(type)?.(payload)
  };
};

const setup = () => {
  const room = makeRoom();
  const statuses: ConnectionStatus[] = [];
  const gatherResults: GatherResult[] = [];
  const joinOrCreate = vi.fn(async () => room);
  const connection = new WorldConnection('wss://world.example.test', {
    onStatus: (status) => statuses.push(status),
    onSnapshot: vi.fn(),
    onGatherResult: (result) => gatherResults.push(result)
  }, { createClient: () => ({ joinOrCreate }) as never, debug: false, recoveryDelaysMs: [0, 0] });
  return { connection, room, statuses, gatherResults, joinOrCreate };
};

describe('WorldConnection lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ticket: 'redacted-world-ticket', expiresAt: Date.now() + 30_000
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a successful authenticated join connected', async () => {
    const { connection, statuses } = setup();
    await connection.connect();
    expect(statuses).toEqual(['connecting', 'connected']);
    connection.destroy('test teardown');
  });

  it('shows reconnecting through transient drop errors and reuses the existing room', async () => {
    const { connection, room, statuses, joinOrCreate } = setup();
    await connection.connect();
    room.onDrop.emit(1006, 'network interruption');
    room.onError.emit(1006, 'retry failed');

    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting']);
    expect(joinOrCreate).toHaveBeenCalledOnce();

    room.onReconnect.emit();
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    expect(joinOrCreate).toHaveBeenCalledOnce();
    connection.destroy('test teardown');
  });

  it('falls back once only after token and fresh-session recovery are exhausted', async () => {
    const { connection, room, statuses, joinOrCreate } = setup();
    await connection.connect();
    joinOrCreate.mockRejectedValue(new Error('room remains unavailable'));
    room.onDrop.emit(1006);
    room.onError.emit(1006);
    room.onLeave.emit(4003, 'reconnection exhausted');
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('unavailable'));

    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'unavailable']);
    expect(joinOrCreate).toHaveBeenCalledTimes(4);
    connection.destroy('test teardown');
  });

  it('recovers with one fresh authenticated join after the prior session expires', async () => {
    const { connection, room, statuses, joinOrCreate } = setup();
    await connection.connect();
    room.onDrop.emit(1006);
    room.onLeave.emit(4003, 'reconnection exhausted');
    await vi.waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('connected'));

    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    connection.destroy('test teardown');
  });

  it('keeps Moonberry interaction available while connected', async () => {
    const { connection, room, gatherResults } = setup();
    await connection.connect();
    connection.gatherMoonberry();

    expect(room.send).toHaveBeenCalledWith('gather', {
      requestId: '123e4567-e89b-42d3-a456-426614174000', nodeKey: 'moonberry-bush'
    });
    room.emitMessage('gather-result', {
      requestId: '123e4567-e89b-42d3-a456-426614174000', status: 'success', itemTitle: 'Moonberry'
    });
    expect(gatherResults).toEqual([expect.objectContaining({ status: 'success' })]);
    connection.destroy('test teardown');
  });

  it('destroys the active room exactly once', async () => {
    const { connection, room } = setup();
    await connection.connect();
    connection.destroy('navigation teardown');
    connection.destroy('duplicate teardown');
    expect(room.leave).toHaveBeenCalledOnce();
  });
});
