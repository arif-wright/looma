import type { PlayerSnapshot } from '../../protocol';

export type VisualRosterDelta = {
  added: string[];
  removed: string[];
  companionsAdded: string[];
  companionsRemoved: string[];
};

export const calculateVisualRosterDelta = (
  existingPlayers: ReadonlySet<string>,
  existingCompanions: ReadonlySet<string>,
  players: ReadonlyMap<string, PlayerSnapshot>
): VisualRosterDelta => {
  const ids = new Set(players.keys());
  const companionIds = new Set(
    [...players].filter(([, player]) => player.companionPresent).map(([id]) => id)
  );
  return {
    added: [...ids].filter((id) => !existingPlayers.has(id)),
    removed: [...existingPlayers].filter((id) => !ids.has(id)),
    companionsAdded: [...companionIds].filter((id) => !existingCompanions.has(id)),
    companionsRemoved: [...existingCompanions].filter((id) => !companionIds.has(id))
  };
};
