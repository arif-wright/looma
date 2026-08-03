export const WORLD_ROOM_NAME = 'wilds';
export const WORLD_PROTOCOL_VERSION = 1;
export const MOVEMENT_MESSAGE = 'move';
export const PROTOCOL_ERROR_MESSAGE = 'protocol-error';
export const COMPANION_REFRESH_MESSAGE = 'companion-refresh';
export const GATHER_MESSAGE = 'gather';
export const GATHER_RESULT_MESSAGE = 'gather-result';

export type MovementIntent = {
  sequence: number;
  x: number;
  y: number;
};

export type ProtocolError = {
  code: 'malformed_message' | 'rate_limited' | 'stale_sequence';
};

export type GatherRequest = { requestId: string; nodeKey: 'moonberry-bush' };
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
