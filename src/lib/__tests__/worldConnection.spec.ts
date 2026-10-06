import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldConnection } from '$lib/game/worldConnection';
import type { ConnectionDiagnostic, ConnectionStatus, GatherResult, PortalResult } from '$lib/game/protocol';

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
  const onGatherStart = vi.fn();
  const portalResults: PortalResult[] = [];
  const onSnapshot = vi.fn();
  const diagnostics: Array<ConnectionDiagnostic | null> = [];
  const joinOrCreate = vi.fn(async () => room);
  const connection = new WorldConnection('wss://world.example.test', {
    onStatus: (status) => statuses.push(status),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    onSnapshot,
    onGatherStart,
    onPortalResult: (result) => portalResults.push(result),
    onGatherResult: (result) => gatherResults.push(result)
  }, { createClient: () => ({ joinOrCreate }) as never, debug: false, recoveryDelaysMs: [0, 0] });
  return { connection, room, statuses, diagnostics, gatherResults, portalResults, onSnapshot, onGatherStart, joinOrCreate };
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

  it('sends one bounded portal request and accepts only its matching response', async () => {
    const { connection, room, portalResults } = setup();
    await connection.connect();
    connection.enterPortal('grove-to-hollow'); connection.enterPortal('grove-to-hollow');
    const sends = room.send.mock.calls.filter(([type]) => type === 'portal');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.[1]).toEqual({ requestId: '123e4567-e89b-42d3-a456-426614174000', portalId: 'grove-to-hollow' });
    room.emitMessage('portal-result', { requestId: 'unknown', status: 'success' });
    expect(portalResults).toEqual([]);
    room.emitMessage('portal-result', { requestId: '123e4567-e89b-42d3-a456-426614174000', status: 'success', mapId: 'wilds-town' });
    expect(portalResults).toHaveLength(1);
    connection.destroy();
  });

  it('never resends portal intents after transport loss or fresh authorization', async () => {
    const { connection, room, portalResults } = setup();
    await connection.connect(); connection.enterPortal('grove-to-hollow');
    room.onDrop.emit(1006); room.onReconnect.emit();
    expect(portalResults).toEqual([expect.objectContaining({ status: 'unavailable' })]);
    expect(room.send.mock.calls.filter(([type]) => type === 'portal')).toHaveLength(1);
    connection.destroy();
  });

  it('fails a portal after its bounded timeout and clears timers on teardown', async () => {
    vi.useFakeTimers();
    const { connection, portalResults } = setup();
    await connection.connect(); connection.enterPortal('grove-to-hollow');
    await vi.advanceTimersByTimeAsync(10_001);
    expect(portalResults).toEqual([expect.objectContaining({ status: 'unavailable' })]);
    connection.enterPortal('grove-to-hollow'); connection.destroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(portalResults).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('clears an unresolved portal before checkpoint recovery so the next room can travel', async () => {
    const { connection, room, joinOrCreate, portalResults } = setup();
    await connection.connect(); connection.enterPortal('grove-to-hollow');
    const replacement = makeRoom(); joinOrCreate.mockResolvedValueOnce(replacement);
    room.onLeave.emit(4004); await vi.waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
    expect(portalResults).toEqual([expect.objectContaining({ status: 'unavailable' })]);
    connection.enterPortal('hollow-to-grove');
    expect(replacement.send).toHaveBeenCalledWith('portal', expect.objectContaining({ portalId: 'hollow-to-grove' }));
    room.emitMessage('portal-result', { requestId: '123e4567-e89b-42d3-a456-426614174000', status: 'success' });
    expect(portalResults).toHaveLength(1); connection.destroy();
  });

  it('fresh-authorizes a checkpoint resync and ignores the replaced room callbacks', async () => {
    const { connection, room, joinOrCreate, portalResults, onSnapshot } = setup();
    await connection.connect(); const replacement = makeRoom(); joinOrCreate.mockResolvedValueOnce(replacement);
    room.onLeave.emit(4004);
    await vi.waitFor(() => expect(joinOrCreate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));
    connection.enterPortal('grove-to-hollow');
    room.onStateChange.emit(room.state);
    room.emitMessage('portal-result', { requestId: '123e4567-e89b-42d3-a456-426614174000', status: 'success' });
    expect(onSnapshot).toHaveBeenCalledTimes(2); expect(portalResults).toHaveLength(0);
    replacement.emitMessage('portal-result', { requestId: '123e4567-e89b-42d3-a456-426614174000', status: 'success' });
    expect(portalResults).toHaveLength(1); connection.destroy();
  });

  it('sends protocol negotiation on initial and refresh ticket requests', async () => {
    const { connection, room } = setup(); await connection.connect(); room.onReconnect.emit();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    for (const [, options] of vi.mocked(fetch).mock.calls) expect(options?.headers).toMatchObject({ 'x-world-protocol': '2' });
    connection.destroy();
  });

  it('closes an active outdated client on refresh and clears its pending interactions', async () => {
    const { connection, room, diagnostics, portalResults } = setup();
    await connection.connect(); connection.enterPortal('grove-to-hollow');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 409 })));
    room.onReconnect.emit();
    await vi.waitFor(() => expect(diagnostics.at(-1)).toEqual({ code: 'client_outdated' }));
    expect(room.leave).toHaveBeenCalledWith(true); expect(portalResults).toEqual([expect.objectContaining({ status: 'unavailable' })]);
    room.onLeave.emit(1000); expect(diagnostics.at(-1)).toEqual({ code: 'client_outdated' });
    connection.destroy();
  });

  it('shows refresh-required without joining or retrying an obsolete client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'client_refresh_required' }), { status: 409 })));
    const { connection, joinOrCreate, diagnostics, statuses } = setup(); await connection.connect();
    expect(joinOrCreate).not.toHaveBeenCalled(); expect(diagnostics).toEqual([{ code: 'client_outdated' }]);
    expect(statuses.at(-1)).toBe('unavailable'); connection.destroy();
  });

  it('keeps a successful authenticated join connected', async () => {
    const { connection, statuses, diagnostics } = setup();
    await connection.connect();
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(diagnostics).toEqual([null]);
    connection.destroy('test teardown');
  });

  it('does not mark an open room unavailable when snapshot presentation throws', async () => {
    const room = makeRoom();
    const statuses: ConnectionStatus[] = [];
    const connection = new WorldConnection('wss://world.example.test', {
      onStatus: (status) => statuses.push(status),
      onSnapshot: () => { throw new Error('scene not ready'); },
      onGatherResult: vi.fn()
    }, { createClient: () => ({ joinOrCreate: vi.fn(async () => room) }) as never, debug: false });

    await connection.connect();
    expect(statuses).toEqual(['connecting', 'connected']);
    connection.destroy('test teardown');
  });

  it('reports a safe diagnostic for ticket and terminal connection failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const ticketFailure = setup();
    await ticketFailure.connection.connect();
    expect(ticketFailure.diagnostics).toEqual([{ code: 'ticket_unavailable', statusCode: 503 }]);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ticket: 'redacted-world-ticket', expiresAt: Date.now() + 30_000
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const closed = setup();
    await closed.connection.connect();
    closed.room.onLeave.emit(4101);
    expect(closed.diagnostics.at(-1)).toEqual({ code: 'connection_closed', statusCode: 4101 });
    closed.connection.destroy('test teardown');
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

describe('WorldConnection graceful restart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ticket: 'redacted-world-ticket', expiresAt: Date.now() + 30_000
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('pauses input, fails pending interactions once, and waits for server close before fresh auth', async () => {
    const { connection, room, statuses, gatherResults, portalResults, onSnapshot, joinOrCreate } = setup();
    const replacement = makeRoom();
    await connection.connect();
    connection.gatherMoonberry(); connection.enterPortal('grove-to-hollow');
    room.emitMessage('server-shutdown', { retry: true });
    room.emitMessage('server-shutdown', { retry: true });
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(room.reconnection.maxRetries).toBe(0);
    expect(gatherResults).toEqual([expect.objectContaining({ status: 'unconfirmed' })]);
    expect(portalResults).toEqual([expect.objectContaining({ status: 'unavailable' })]);
    const sentBefore = room.send.mock.calls.length;
    connection.sendMovement({ sequence: 8, x: 1, y: 0 });
    room.onReconnect.emit(); room.onStateChange.emit(room.state);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(room.send).toHaveBeenCalledTimes(sentBefore);
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(joinOrCreate).toHaveBeenCalledOnce();
    joinOrCreate.mockResolvedValueOnce(replacement);
    room.onLeave.emit(4001); room.onLeave.emit(4001);
    expect(joinOrCreate).toHaveBeenCalledOnce();
    await vi.runOnlyPendingTimersAsync();
    expect(joinOrCreate).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('connected');
    expect(replacement.send).not.toHaveBeenCalled();
    expect(gatherResults).toHaveLength(1); expect(portalResults).toHaveLength(1);
    connection.destroy();
  });

  it('recovers from close code 4001 even when the shutdown notice was lost', async () => {
    const { connection, room, statuses, joinOrCreate, gatherResults } = setup();
    await connection.connect(); connection.gatherMoonberry();
    const replacement = makeRoom(); joinOrCreate.mockResolvedValueOnce(replacement);
    room.onLeave.emit(4001);
    expect(statuses.at(-1)).toBe('reconnecting');
    await vi.runOnlyPendingTimersAsync();
    expect(joinOrCreate).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('connected');
    expect(gatherResults).toEqual([expect.objectContaining({ status: 'unconfirmed' })]);
    expect(replacement.send).not.toHaveBeenCalled();
    connection.destroy();
  });

  it('does not send a delayed companion refresh after shutdown or into the replacement room', async () => {
    const { connection, room, joinOrCreate } = setup();
    await connection.connect();
    let finishRefresh!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }));
    room.onReconnect.emit();
    expect(fetch).toHaveBeenCalledTimes(2);
    room.emitMessage('server-shutdown', { retry: true }); room.onLeave.emit(4001);
    const replacement = makeRoom(); joinOrCreate.mockResolvedValueOnce(replacement);
    await vi.runOnlyPendingTimersAsync();
    finishRefresh(new Response(JSON.stringify({ ticket: 'stale-ticket' }), { status: 200 }));
    await Promise.resolve(); await Promise.resolve();
    expect(room.send).not.toHaveBeenCalled();
    expect(replacement.send).not.toHaveBeenCalled();
    connection.destroy();
  });

  it('cancels restart recovery on navigation and ignores obsolete room notices', async () => {
    const { connection, room, statuses, joinOrCreate } = setup();
    await connection.connect();
    room.emitMessage('server-shutdown', { retry: true }); room.onLeave.emit(4001);
    connection.destroy();
    await vi.runOnlyPendingTimersAsync();
    room.onReconnect.emit(); room.emitMessage('server-shutdown', { retry: true });
    expect(joinOrCreate).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('requires a page refresh when fresh restart authorization rejects the old protocol', async () => {
    const { connection, room, diagnostics, joinOrCreate } = setup();
    await connection.connect();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    room.emitMessage('server-shutdown', { retry: true }); room.onLeave.emit(4001);
    await vi.runOnlyPendingTimersAsync();
    expect(diagnostics.at(-1)).toEqual({ code: 'client_outdated' });
    expect(joinOrCreate).toHaveBeenCalledOnce();
    connection.destroy();
  });
});

describe('WorldConnection bounded Moonberry interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let nextId = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `123e4567-e89b-42d3-a456-${String(++nextId).padStart(12, '0')}` });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ticket: 'synthetic-ticket', expiresAt: Date.now() + 30_000
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const gathers = (room: ReturnType<typeof makeRoom>) => room.send.mock.calls.filter(([type]) => type === 'gather');

  it('accepts only one pending intent across repeated keyboard and button callers', async () => {
    const { connection, room, onGatherStart, gatherResults } = setup();
    await connection.connect();
    // Both input paths use this same transport entry point.
    connection.gatherMoonberry(); connection.gatherMoonberry(); connection.gatherMoonberry();
    expect(gathers(room)).toHaveLength(1); expect(onGatherStart).toHaveBeenCalledOnce();
    const request = gathers(room)[0][1];
    room.emitMessage('gather-result', { ...request, status: 'success', quantity: 1 });
    expect(gatherResults).toHaveLength(1);
    connection.gatherMoonberry();
    expect(gathers(room)).toHaveLength(2); expect(onGatherStart).toHaveBeenCalledTimes(2);
    expect(gathers(room)[1][1].requestId).not.toBe(request.requestId);
    connection.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a lost reply once at the deadline without retransmitting or claiming failure', async () => {
    const { connection, room, gatherResults } = setup();
    await connection.connect(); connection.gatherMoonberry();
    const request = gathers(room)[0][1];
    await vi.advanceTimersByTimeAsync(9_999); expect(gatherResults).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(gatherResults).toEqual([{ requestId: request.requestId, status: 'unconfirmed' }]);
    await vi.advanceTimersByTimeAsync(10_000); expect(gatherResults).toHaveLength(1);
    room.emitMessage('gather-result', { ...request, status: 'success' });
    expect(gatherResults).toHaveLength(1); expect(gathers(room)).toHaveLength(1);
    connection.gatherMoonberry();
    room.emitMessage('gather-result', { ...request, status: 'success' });
    expect(gatherResults).toHaveLength(1);
    room.emitMessage('gather-result', { ...gathers(room)[1][1], status: 'cooldown' });
    expect(gatherResults.at(-1)?.status).toBe('cooldown');
    connection.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores malformed, unmatched, duplicate and wire-only unconfirmed results', async () => {
    const { connection, room, gatherResults } = setup();
    await connection.connect();
    room.emitMessage('gather-result', { status: 'success' });
    expect(gatherResults).toEqual([]);
    connection.gatherMoonberry(); const request = gathers(room)[0][1];
    for (const result of [null, {}, { status: 'success' }, { requestId: 'other', status: 'success' },
      { ...request, status: 'invented' }, { ...request, status: 'unconfirmed' }]) room.emitMessage('gather-result', result);
    expect(gatherResults).toEqual([]);
    room.emitMessage('gather-result', { ...request, status: 'success' });
    room.emitMessage('gather-result', { ...request, status: 'success' });
    expect(gatherResults).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_001); expect(gatherResults).toHaveLength(1);
    connection.destroy();
  });

  it('settles a dropped request once and never resends on same-room reconnect', async () => {
    const { connection, room, gatherResults, onGatherStart } = setup();
    await connection.connect(); connection.gatherMoonberry();
    const old = gathers(room)[0][1];
    room.onDrop.emit(1006); room.onDrop.emit(1006); room.onReconnect.emit();
    expect(gatherResults).toEqual([{ requestId: old.requestId, status: 'unconfirmed' }]);
    expect(gathers(room)).toHaveLength(1); expect(onGatherStart).toHaveBeenCalledOnce();
    room.emitMessage('gather-result', { ...old, status: 'success' });
    expect(gatherResults).toHaveLength(1);
    connection.gatherMoonberry(); expect(gathers(room)).toHaveLength(2);
    room.emitMessage('gather-result', { ...gathers(room)[1][1], status: 'success' });
    expect(gatherResults.at(-1)?.status).toBe('success'); connection.destroy();
  });

  it.each([4004, 4003])('never carries an uncertain gather into fresh authorization (%s)', async (code) => {
    const { connection, room, joinOrCreate, gatherResults } = setup();
    await connection.connect(); connection.gatherMoonberry();
    const old = gathers(room)[0][1]; const replacement = makeRoom();
    joinOrCreate.mockResolvedValueOnce(replacement);
    if (code === 4003) room.onDrop.emit(1006);
    room.onLeave.emit(code);
    await vi.advanceTimersByTimeAsync(0);
    expect(joinOrCreate).toHaveBeenCalledTimes(2);
    expect(gathers(replacement)).toEqual([]);
    expect(gatherResults).toEqual([{ requestId: old.requestId, status: 'unconfirmed' }]);
    connection.gatherMoonberry(); const next = gathers(replacement)[0][1];
    room.emitMessage('gather-result', { ...next, status: 'success' });
    expect(gatherResults).toHaveLength(1);
    replacement.emitMessage('gather-result', { ...next, status: 'success' });
    expect(gatherResults).toHaveLength(2); connection.destroy();
  });

  it('bounds synchronous send failures and permits a later explicit retry', async () => {
    const { connection, room, gatherResults, onGatherStart } = setup();
    await connection.connect(); room.send.mockImplementationOnce(() => { throw new Error('synthetic transport failure'); });
    expect(() => connection.gatherMoonberry()).not.toThrow();
    expect(gatherResults).toEqual([expect.objectContaining({ status: 'unconfirmed' })]);
    expect(onGatherStart).toHaveBeenCalledOnce();
    connection.gatherMoonberry(); expect(gathers(room)).toHaveLength(2);
    connection.destroy(); expect(vi.getTimerCount()).toBe(0);
  });

  it('silently cancels teardown and ignores later outcomes and new intents', async () => {
    const { connection, room, gatherResults, onGatherStart } = setup();
    await connection.connect(); connection.gatherMoonberry(); const request = gathers(room)[0][1];
    connection.destroy(); connection.destroy(); connection.gatherMoonberry();
    room.emitMessage('gather-result', { ...request, status: 'success' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gatherResults).toEqual([]); expect(onGatherStart).toHaveBeenCalledOnce();
    expect(gathers(room)).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending gathering on refresh rejection and prevents unauthorized intents', async () => {
    const { connection, room, gatherResults } = setup();
    await connection.connect();
    await vi.advanceTimersByTimeAsync(25_000);
    connection.gatherMoonberry();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(gatherResults).toEqual([expect.objectContaining({ status: 'unconfirmed' })]);
    connection.gatherMoonberry(); expect(gathers(room)).toHaveLength(1);
    expect(gatherResults.at(-1)?.status).toBe('unavailable'); connection.destroy();
  });
});
