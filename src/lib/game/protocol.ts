export const WORLD_ROOM_NAME = 'wilds';
export const WORLD_PROTOCOL_VERSION = 1;
export const MOVE_MESSAGE = 'move';
export const GATHER_MESSAGE = 'gather';
export const GATHER_RESULT_MESSAGE = 'gather-result';

export type MovementIntent = { sequence: number; x: number; y: number };
export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'unauthorized';

export type ConnectionDiagnostic = {
  code: 'configuration_missing' | 'ticket_rejected' | 'ticket_unavailable' | 'ticket_malformed' |
    'join_failed' | 'connection_closed' | 'recovery_exhausted';
  statusCode?: number | undefined;
};
export type PlayerSnapshot = {
  x: number;
  y: number;
  connected: boolean;
  acknowledgedSequence: number;
  colorIndex: number;
  displayName: string;
  handle: string;
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
};
export type GatherResult = {
  requestId: string;
  status: 'success' | 'cooldown' | 'inventory_full' | 'out_of_range' | 'unavailable' | 'failure';
  itemTitle?: string;
  quantity?: number;
  cooldownUntil?: string | null;
  reaction?: string | null;
  inventoryHref?: '/app/inventory';
  replayed?: boolean;
};
