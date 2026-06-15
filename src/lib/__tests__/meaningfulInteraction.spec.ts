import { describe, expect, it } from 'vitest';
import {
  meaningfulInteractionPatch,
  type MeaningfulCompanionAction
} from '$lib/companions/meaningfulInteraction';

describe('meaningful companion interaction timestamps', () => {
  it('marks every Phase 1 meaningful action with the same canonical timestamp field', () => {
    const occurredAt = '2026-06-15T12:00:00.000Z';
    const actions: MeaningfulCompanionAction[] = [
      'feed',
      'play',
      'groom',
      'check_in',
      'presence',
      'shared_rest'
    ];

    for (const action of actions) {
      expect(meaningfulInteractionPatch(action, occurredAt)).toEqual({
        last_meaningful_interaction_at: occurredAt
      });
    }
  });
});
