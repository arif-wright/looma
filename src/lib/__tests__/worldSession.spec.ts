import { describe, expect, it, vi } from 'vitest';
import { WorldSession } from '$lib/game/worldSession';

describe('renderer-neutral WorldSession', () => {
  it('starts one connection and tears it down exactly once', () => {
    const connection = { connect: vi.fn(), sendMovement: vi.fn(), gatherMoonberry: vi.fn(), destroy: vi.fn() };
    const createConnection = vi.fn(() => connection);
    const session = new WorldSession('wss://world.test', {
      onStatus: vi.fn(), onDiagnostic: vi.fn(), onGatherResult: vi.fn()
    }, createConnection);

    session.start();
    session.start();
    session.destroy('navigation');
    session.destroy('duplicate');

    expect(createConnection).toHaveBeenCalledOnce();
    expect(connection.connect).toHaveBeenCalledOnce();
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.destroy).toHaveBeenCalledWith('navigation');
  });

  it('owns monotonic wire sequences across stop, portal and input scheduler resets', () => {
    const connection = { connect: vi.fn(), sendMovement: vi.fn(), gatherMoonberry: vi.fn(), enterPortal: vi.fn(), destroy: vi.fn() };
    let callbacks: any;
    const session = new WorldSession('wss://world.test', { onStatus: vi.fn(), onDiagnostic: vi.fn(), onGatherResult: vi.fn() }, (_url, events) => { callbacks = events; return connection; });
    const status = vi.fn(); session.setStatusConsumer(status); session.start(); callbacks.onStatus('connected');
    session.sendMovement({ sequence: 99, x: 1, y: 0 }); session.stopMovement();
    session.sendMovement({ sequence: 1, x: -1, y: 0 }); session.enterPortal('grove-to-hollow');
    expect(connection.sendMovement.mock.calls.map(([intent]) => intent.sequence)).toEqual([1, 2, 3, 4]);
    expect(connection.sendMovement).toHaveBeenLastCalledWith({ sequence: 4, x: 0, y: 0 });
    expect(connection.enterPortal).toHaveBeenCalledWith('grove-to-hollow');
    callbacks.onStatus('reconnecting'); session.sendMovement({ sequence: 100, x: 1, y: 0 }); session.enterPortal('hollow-to-grove');
    expect(connection.sendMovement).toHaveBeenCalledTimes(4); expect(connection.enterPortal).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('reconnecting'); session.destroy();
  });

  it('does not connect when configuration is absent', () => {
    const createConnection = vi.fn();
    const onStatus = vi.fn();
    const onDiagnostic = vi.fn();
    new WorldSession(null, { onStatus, onDiagnostic, onGatherResult: vi.fn() }, createConnection).start();
    expect(createConnection).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('offline');
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'configuration_missing' });
  });
});
