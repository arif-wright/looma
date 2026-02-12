import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  getConversationMembers
} from '$lib/server/messenger';

type MembershipRow = {
  conversation_id: string;
  muted: boolean | null;
  last_read_at: string | null;
};

type ConversationRow = {
  id: string;
  type: 'dm' | 'group';
  last_message_at: string | null;
  last_message_preview: string | null;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from('conversation_members')
    .select('conversation_id, muted, last_read_at')
    .eq('user_id', session.user.id);

  if (membershipsError) {
    return json({ error: membershipsError.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const membershipRows = (memberships ?? []) as MembershipRow[];
  if (!membershipRows.length) {
    return json({ items: [] }, { headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationIds = membershipRows.map((row) => row.conversation_id);
  const membershipMap = new Map(membershipRows.map((row) => [row.conversation_id, row]));

  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('id, type, last_message_at, last_message_preview')
    .in('id', conversationIds);

  if (conversationsError) {
    return json({ error: conversationsError.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: unreadRaw, error: unreadError } = await supabase.rpc('rpc_get_unread_counts');
  if (unreadError) {
    return json({ error: unreadError.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const unreadMap = new Map<string, number>();
  if (Array.isArray(unreadRaw)) {
    for (const row of unreadRaw as Array<{ conversation_id?: unknown; unread_count?: unknown }>) {
      if (typeof row.conversation_id !== 'string') continue;
      const count = Number(row.unread_count ?? 0);
      unreadMap.set(row.conversation_id, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    }
  }

  const memberLists = await Promise.all(
    ((conversations ?? []) as ConversationRow[]).map(async (conversation) => ({
      conversationId: conversation.id,
      memberIds: await getConversationMembers(supabase, conversation.id)
    }))
  );
  const memberMap = new Map(memberLists.map((entry) => [entry.conversationId, entry.memberIds]));

  const peerIds = [...new Set(memberLists.flatMap((entry) => entry.memberIds).filter((id) => id !== session.user.id))];
  const { data: profileRows } = peerIds.length
    ? await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .in('id', peerIds)
    : { data: [] };

  const profileMap = new Map<
    string,
    { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }
  >();
  if (Array.isArray(profileRows)) {
    for (const row of profileRows as Array<{
      id?: unknown;
      handle?: unknown;
      display_name?: unknown;
      avatar_url?: unknown;
    }>) {
      if (typeof row.id !== 'string') continue;
      profileMap.set(row.id, {
        id: row.id,
        handle: typeof row.handle === 'string' ? row.handle : null,
        display_name: typeof row.display_name === 'string' ? row.display_name : null,
        avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null
      });
    }
  }

  const items = await Promise.all(
    ((conversations ?? []) as ConversationRow[]).map(async (conversation) => {
      const memberIds = memberMap.get(conversation.id) ?? [];
      const peerId = memberIds.find((id) => id !== session.user.id) ?? null;
      let blocked = false;

      if (conversation.type === 'dm' && peerId) {
        const { data: isBlocked } = await supabase.rpc('rpc_is_blocked', {
          p_other_user_id: peerId
        });
        blocked = isBlocked === true;
      }

      const membership = membershipMap.get(conversation.id);

      return {
        conversationId: conversation.id,
        type: conversation.type,
        last_message_at: conversation.last_message_at,
        preview: conversation.last_message_preview,
        memberIds,
        peer: peerId ? profileMap.get(peerId) ?? { id: peerId, handle: null, display_name: null, avatar_url: null } : null,
        muted: membership?.muted ?? false,
        lastReadAt: membership?.last_read_at ?? null,
        unreadCount: unreadMap.get(conversation.id) ?? 0,
        blocked
      };
    })
  );

  items.sort((a, b) => {
    const aTime = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const bTime = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return bTime - aTime;
  });

  return json({ items }, { headers: MESSENGER_CACHE_HEADERS });
};
