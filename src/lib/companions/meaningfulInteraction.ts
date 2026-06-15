export type MeaningfulCompanionAction =
  | 'feed'
  | 'play'
  | 'groom'
  | 'check_in'
  | 'presence'
  | 'shared_rest';

export const meaningfulInteractionPatch = (
  _action: MeaningfulCompanionAction,
  occurredAt: string
) => ({
  last_meaningful_interaction_at: occurredAt
});
