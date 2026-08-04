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
