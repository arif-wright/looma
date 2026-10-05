import { getWorldArea, portalAtPosition, type WorldAreaId } from '../../areas';
import type { ConnectionStatus, NpcSnapshot, PlayerSnapshot, WorldSnapshot } from '../../protocol';
import { MOONBERRY_INTERACTION } from '../../traversal';

/** Every roster is scoped before visual reconciliation; residents never enter the player roster. */
export const visibleAreaRoster = (snapshot: WorldSnapshot, mapId: WorldAreaId) => ({
  players: new Map([...snapshot.players].filter(([, player]) => getWorldArea(player.mapId).id === mapId)),
  npcs: new Map([...(snapshot.npcs ?? new Map<string, NpcSnapshot>())].filter(([, npc]) => npc.mapId === mapId))
});

export const playerTransitionKey = (player: PlayerSnapshot) =>
  `${getWorldArea(player.mapId).id}:${player.transitionRevision ?? 0}`;

/** Interaction eligibility always comes from the authoritative snapshot, never prediction. */
export const areaInteraction = (player: PlayerSnapshot | undefined, status: ConnectionStatus, paused = false) => {
  if (!player || !player.connected || status !== 'connected' || paused) return { portal: null, gather: false };
  const portal = portalAtPosition(player.mapId, player);
  const moonberry = MOONBERRY_INTERACTION;
  return {
    portal,
    gather: !portal && getWorldArea(player.mapId).id === 'wilds-exploration' &&
      Math.hypot(player.x - moonberry.x, player.y - moonberry.y) <= moonberry.radius
  };
};
