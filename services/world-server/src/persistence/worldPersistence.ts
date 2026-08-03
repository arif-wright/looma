import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { restoreWorldPosition, type WorldMapDefinition } from '../world/maps.js';

export type LoadedWorldState = {
  position: { x: number; y: number };
  stateVersion: number;
  discoveries: Set<string>;
  restored: boolean;
};

export type SaveWorldStateResult = { ok: true; stateVersion: number } | { ok: false; conflict: true };
export type GatherPersistenceResult = {
  status: 'success' | 'cooldown' | 'inventory_full';
  itemTitle: string;
  quantity: number;
  cooldownUntil: string | null;
  reaction: string | null;
  inventoryHref?: '/app/inventory';
  replayed: boolean;
};

export interface WorldPersistence {
  load(userId: string, map: WorldMapDefinition): Promise<LoadedWorldState>;
  save(args: {
    userId: string; map: WorldMapDefinition; x: number; y: number; expectedStateVersion: number;
  }): Promise<SaveWorldStateResult>;
  discover(args: {
    userId: string; map: WorldMapDefinition; landmarkKey: string; x: number; y: number; idempotencyKey: string;
  }): Promise<{ newlyDiscovered: boolean }>;
  gather(args: {
    userId: string; map: WorldMapDefinition; nodeKey: string; x: number; y: number; idempotencyKey: string;
  }): Promise<GatherPersistenceResult>;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export class SupabaseWorldPersistence implements WorldPersistence {
  constructor(private readonly supabase: SupabaseClient) {}

  async load(userId: string, map: WorldMapDefinition): Promise<LoadedWorldState> {
    const { data, error } = await this.supabase.rpc('fn_world_load_state', {
      p_user: userId, p_preferred_map: map.id
    });
    if (error) throw new Error(`world_load_failed:${error.code ?? 'unknown'}`);
    const result = asRecord(data);
    const restored = restoreWorldPosition(map, {
      mapId: result.mapId, mapVersion: result.mapVersion, x: result.x, y: result.y
    });
    const stateVersion = Number(result.stateVersion);
    const discoveries = Array.isArray(result.discoveries)
      ? new Set(result.discoveries.filter((value): value is string => typeof value === 'string').slice(0, 256))
      : new Set<string>();
    return {
      ...restored,
      stateVersion: Number.isSafeInteger(stateVersion) && stateVersion > 0 ? stateVersion : 1,
      discoveries
    };
  }

  async save(args: {
    userId: string; map: WorldMapDefinition; x: number; y: number; expectedStateVersion: number;
  }): Promise<SaveWorldStateResult> {
    const { data, error } = await this.supabase.rpc('fn_world_save_state', {
      p_user: args.userId, p_map_id: args.map.id, p_map_version: args.map.version,
      p_x: args.x, p_y: args.y, p_expected_state_version: args.expectedStateVersion
    });
    if (error) throw new Error(`world_save_failed:${error.code ?? 'unknown'}`);
    const result = asRecord(data);
    if (result.ok !== true) return { ok: false, conflict: true };
    const stateVersion = Number(result.stateVersion);
    if (!Number.isSafeInteger(stateVersion) || stateVersion <= args.expectedStateVersion) {
      throw new Error('world_save_invalid_version');
    }
    return { ok: true, stateVersion };
  }

  async discover(args: {
    userId: string; map: WorldMapDefinition; landmarkKey: string; x: number; y: number; idempotencyKey: string;
  }) {
    const { data, error } = await this.supabase.rpc('fn_world_record_landmark', {
      p_user: args.userId, p_map_id: args.map.id, p_map_version: args.map.version,
      p_landmark_key: args.landmarkKey, p_x: args.x, p_y: args.y,
      p_idempotency_key: args.idempotencyKey
    });
    if (error) throw new Error(`world_discovery_failed:${error.code ?? 'unknown'}`);
    return { newlyDiscovered: asRecord(data).newlyDiscovered === true };
  }

  async gather(args: {
    userId: string; map: WorldMapDefinition; nodeKey: string; x: number; y: number; idempotencyKey: string;
  }): Promise<GatherPersistenceResult> {
    const { data, error } = await this.supabase.rpc('fn_world_gather_moonberry', {
      p_user: args.userId, p_map_id: args.map.id, p_map_version: args.map.version,
      p_node_key: args.nodeKey, p_x: args.x, p_y: args.y, p_idempotency_key: args.idempotencyKey
    });
    if (error) throw new Error(`world_gather_failed:${error.code ?? 'unknown'}`);
    const result = asRecord(data);
    if (result.status !== 'success' && result.status !== 'cooldown' && result.status !== 'inventory_full') {
      throw new Error('world_gather_invalid_result');
    }
    return {
      status: result.status,
      itemTitle: typeof result.itemTitle === 'string' ? result.itemTitle.slice(0, 80) : 'Moonberry',
      quantity: Number.isSafeInteger(result.quantity) ? Number(result.quantity) : 0,
      cooldownUntil: typeof result.cooldownUntil === 'string' ? result.cooldownUntil : null,
      reaction: typeof result.reaction === 'string' ? result.reaction.slice(0, 320) : null,
      replayed: result.replayed === true,
      ...(result.inventoryHref === '/app/inventory' ? { inventoryHref: '/app/inventory' as const } : {})
    };
  }
}

export const createWorldPersistence = (url: string, serviceRoleKey: string): WorldPersistence | null => {
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'memvoya-world-server' } }
  });
  return new SupabaseWorldPersistence(client);
};
