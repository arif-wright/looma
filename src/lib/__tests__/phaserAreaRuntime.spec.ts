/** Actual Phaser adapter with graphics/scene doubles; proves area-callback authority only. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldGame } from '../game/worldGame';
import type { PlayerSnapshot, WorldSnapshot } from '../game/protocol';
import type { WorldSession } from '../game/worldSession';

const state = vi.hoisted(() => ({ applyNetworkSnapshot: vi.fn(), destroy: vi.fn() }));

vi.mock('phaser', () => ({
  default: {
    AUTO: 'auto',
    Scale: { FIT: 'fit', CENTER_BOTH: 'center-both' },
    Game: class {
      scale = { refresh: vi.fn() };
      loop = { sleep: vi.fn(), wake: vi.fn() };
      destroy = state.destroy;
    }
  }
}));

vi.mock('../game/WorldScene', () => ({
  WorldScene: class {
    applyNetworkSnapshot = state.applyNetworkSnapshot;
    setConnectionActive() {}
    setPortalHandlers() {}
    setMovementSender() {}
    setInteractionHandlers() {}
  }
}));

const snapshot = (mapId?: 'wilds-exploration' | 'wilds-town'): WorldSnapshot => ({
  localPlayerId: 'local', tick: 1,
  players: new Map(mapId ? [['local', {
    mapId, transitionRevision: 1, x: 80, y: 270, connected: true,
    acknowledgedSequence: 0, colorIndex: 0, displayName: 'Explorer', handle: '',
    playerBody: 'female', companionPresent: false, companionName: '',
    companionKind: 'muse', companionStatus: 'idle', companionRevision: 0
  } satisfies PlayerSnapshot]] : [])
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { hasFocus: () => true });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Phaser area callback authority', () => {
  it('ignores missing-local snapshots and reports only later authoritative area changes', () => {
    let consume: ((snapshot: WorldSnapshot) => void) | null = null;
    const session = {
      connectionStatus: 'connected',
      setSnapshotConsumer: vi.fn((consumer) => { consume = consumer; }),
      setStatusConsumer: vi.fn((consumer) => { consumer?.('connected'); }),
      stopMovement: vi.fn(), sendMovement: vi.fn(), enterPortal: vi.fn(), gatherMoonberry: vi.fn()
    };
    const onAreaChange = vi.fn();
    const runtime = createWorldGame({} as HTMLElement, {
      session: session as unknown as WorldSession, onAreaChange, onGatherPrompt: vi.fn()
    });
    try {
      consume!(snapshot('wilds-town'));
      expect(onAreaChange).toHaveBeenCalledOnce();
      expect(onAreaChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'wilds-town' }));
      onAreaChange.mockClear();

      const missing = snapshot();
      consume!(missing);
      expect(state.applyNetworkSnapshot).toHaveBeenLastCalledWith(missing);
      expect(onAreaChange).not.toHaveBeenCalled();
      consume!(snapshot('wilds-town'));
      expect(onAreaChange).not.toHaveBeenCalled();

      consume!(snapshot('wilds-exploration'));
      expect(onAreaChange).toHaveBeenCalledOnce();
      expect(onAreaChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'wilds-exploration' }));
    } finally {
      runtime.destroy();
    }
    expect(state.destroy).toHaveBeenCalledOnce();
    expect(session.setSnapshotConsumer).toHaveBeenLastCalledWith(null);
  });
});
