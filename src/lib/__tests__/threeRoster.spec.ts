import { describe, expect, it } from 'vitest';
import { calculateVisualRosterDelta } from '$lib/game/renderers/three/roster';
import type { PlayerSnapshot } from '$lib/game/protocol';

const player = (companionPresent: boolean): PlayerSnapshot => ({
  x: 10, y: 20, connected: true, acknowledgedSequence: 0, colorIndex: 0,
  displayName: 'Explorer', handle: '',
  companionPresent,
  companionName: companionPresent ? 'Mirae' : '', companionKind: '',
  companionStatus: 'idle', companionRevision: 0
});

describe('Three visual roster', () => {
  it('creates/removes remote players and pairs companions by owner player id', () => {
    const next = new Map<string, PlayerSnapshot>([['local', player(true)], ['remote', player(false)]]);
    const added = calculateVisualRosterDelta(new Set(['departed']), new Set(['departed']), next);
    expect(added).toEqual({
      added: ['local', 'remote'], removed: ['departed'],
      companionsAdded: ['local'], companionsRemoved: ['departed']
    });
  });

  it('removes a companion without removing its owner', () => {
    const delta = calculateVisualRosterDelta(new Set(['local']), new Set(['local']), new Map([['local', player(false)]]));
    expect(delta.removed).toEqual([]);
    expect(delta.companionsRemoved).toEqual(['local']);
  });
});
