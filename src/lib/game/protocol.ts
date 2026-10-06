import type { WorldAreaId } from './areas';
import type { PlayerBody } from './playerBody';

export const WORLD_ROOM_NAME = 'wilds';
export const WORLD_PROTOCOL_VERSION = 2;
export const MOVE_MESSAGE = 'move';
export const GATHER_MESSAGE = 'gather';
export const GATHER_RESULT_MESSAGE = 'gather-result';

export type MovementIntent = { sequence: number; x: number; y: number };
export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'unauthorized';

export type ConnectionDiagnostic = {
  code: 'client_outdated' | 'configuration_missing' | 'ticket_rejected' | 'ticket_unavailable' | 'ticket_malformed' |
    'join_failed' | 'connection_closed' | 'recovery_exhausted';
  statusCode?: number | undefined;
};
export type PlayerSnapshot = {
  mapId?: WorldAreaId;
  transitionRevision?: number;
  x: number;
  y: number;
  connected: boolean;
  acknowledgedSequence: number;
  colorIndex: number;
  displayName: string;
  handle: string;
  playerBody: PlayerBody;
  companionPresent: boolean;
  companionName: string;
  companionKind: string;
  companionStatus: 'idle' | 'moving' | 'reconnecting' | 'unavailable';
  companionRevision: number;
};
export type WorldSnapshot = {
  localPlayerId: string;
  tick: number;
  players: Map<string, PlayerSnapshot>;
  npcs?: Map<string, NpcSnapshot>;
};
export type GatherResult = {
  requestId: string;
  // `unconfirmed` is a client-only outcome after transport loss or a timeout.
  // It is not accepted from the wire and does not imply server cancellation.
  status: 'success' | 'cooldown' | 'inventory_full' | 'out_of_range' | 'unavailable' | 'failure' | 'unconfirmed';
  itemTitle?: string;
  quantity?: number;
  cooldownUntil?: string | null;
  reaction?: string | null;
  inventoryHref?: '/app/inventory';
  replayed?: boolean;
};

export const PORTAL_MESSAGE = 'portal';
export const PORTAL_RESULT_MESSAGE = 'portal-result';
export type PortalResult = { requestId: string; status: 'success' | 'out_of_range' | 'cooldown' | 'unavailable' | 'failure'; mapId?: WorldAreaId };
export type NpcSnapshot = { id: string; mapId: WorldAreaId; name: string; kind: 'resident'; playerBody: PlayerBody; x: number; y: number; moving: boolean };
