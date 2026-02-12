import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  getConversationMembers,
  isConversationMember,
  isUuid
} from '$lib/server/messenger';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  client_nonce: string | null;
};

const parseLimit = (value: string | null) => {
  if (!value) return 40;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
};

const decodeCursor = (value: string | null): { createdAt: string; id: string | null } | null => {
  if (!value) return null;
  const [createdAt, id] = value.split('|');
  if (!createdAt) return null;
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time)) return null;
  return {
    createdAt,
    id: typeof id === 'string' && id.length > 0 ? id : null
  };
};

const encodeCursor = (row: MessageRow | null) => (row ? `${row.created_at}|${row.id}` : null);

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationId = event.url.searchParams.get('conversationId');
  const limit = parseLimit(event.url.searchParams.get('limit'));
  const cursor = decodeCursor(event.url.searchParams.get('cursor'));

  if (!isUuid(conversationId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const isMember = await isConversationMember(supabase, conversationId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, client_nonce')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 25);

  if (cursor) {
    query = query.lte('created_at', cursor.createdAt);
  }

  const { data, error } = await query;
  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  let rows = (data ?? []) as MessageRow[];
  if (cursor) {
    rows = rows.filter((row) => {
      if (row.created_at < cursor.createdAt) return true;
      if (row.created_at > cursor.createdAt) return false;
      if (!cursor.id) return false;
      return row.id < cursor.id;
    });
  }

  const pageRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(pageRows.at(-1) ?? null) : null;

  const memberIds = await getConversationMembers(supabase, conversationId);
  const peerId = memberIds.find((id) => id !== session.user.id) ?? null;
  const { data: peerProfile } = peerId
    ? await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .eq('id', peerId)
        .maybeSingle()
    : { data: null };

  let blocked = false;
  if (peerId) {
    const { data: isBlocked } = await supabase.rpc('rpc_is_blocked', {
      p_other_user_id: peerId
    });
    blocked = isBlocked === true;
  }

  return json(
    {
      items: [...pageRows].reverse(),
      nextCursor,
      memberIds,
      peer:
        peerId && peerProfile
          ? {
              id: peerId,
              handle: typeof peerProfile.handle === 'string' ? peerProfile.handle : null,
              display_name: typeof peerProfile.display_name === 'string' ? peerProfile.display_name : null,
              avatar_url: typeof peerProfile.avatar_url === 'string' ? peerProfile.avatar_url : null
            }
          : peerId
            ? { id: peerId, handle: null, display_name: null, avatar_url: null }
            : null,
      blocked
    },
    { headers: MESSENGER_CACHE_HEADERS }
  );
};
