import type { PlayerState } from './state.js';

export type PresenceTransition = 'drop' | 'reconnect' | 'leave';

export const applyPresenceTransition = (
  player: PlayerState | undefined,
  transition: PresenceTransition
): 'keep' | 'remove' => {
  if (!player || transition === 'leave') return 'remove';
  player.connected = transition === 'reconnect';
  player.companionStatus = player.companionPresent
    ? transition === 'drop' ? 'reconnecting' : 'idle'
    : 'unavailable';
  return 'keep';
};
