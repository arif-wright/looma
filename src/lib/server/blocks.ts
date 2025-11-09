import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';

const extractPeerIds = (rows: unknown): Set<string> => {
  const peers = new Set<string>();
  if (!Array.isArray(rows)) return peers;
  for (const row of rows as Array<{ user_id?: unknown }>) {
    const userId = typeof row?.user_id === 'string' ? row.user_id : null;
    if (userId) {
      peers.add(userId);
    }
  }
  return peers;
};

export async function fetchBlockedPeers(
  supabase: SupabaseClient,
  viewerId: string
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('blocked_peers', { viewer: viewerId });
  if (error) {
    console.error('[blocks] blocked_peers rpc failed', error);
    return new Set<string>();
  }
  return extractPeerIds(data ?? []);
}

export async function ensureBlockedPeers(
  event: RequestEvent,
  supabase: SupabaseClient
): Promise<Set<string>> {
  if (event.locals.blockPeers) {
    return event.locals.blockPeers;
  }

  const viewerId = event.locals.user?.id ?? event.locals.session?.user?.id ?? null;
  if (!viewerId) {
    const empty = new Set<string>();
    event.locals.blockPeers = empty;
    return empty;
  }

  const peers = await fetchBlockedPeers(supabase, viewerId);
  event.locals.blockPeers = peers;
  return peers;
}

export const isBlockedPeer = (peers: Set<string>, targetId?: string | null) => {
  if (!targetId) return false;
  return peers.has(targetId);
};
