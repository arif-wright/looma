import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  getConversationMembers,
  isConversationMember,
  isUuid
} from '$lib/server/messenger';
import { requireModerator } from '$lib/server/moderation';
import { resolveAttachmentViewUrls } from '$lib/server/messenger/media';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  client_nonce: string | null;
  has_attachments: boolean;
  preview_kind: 'image' | 'gif' | 'text' | null;
};
type AttachmentRow = {
  id: string;
  message_id: string;
  kind: 'image' | 'gif' | 'file' | 'link';
  url: string;
  storage_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
  view_url: string;
};

type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥';
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
    .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, client_nonce, has_attachments, preview_kind')
    .eq('conversation_id', conversationId)
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

  const { data: conversationRow } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', conversationId)
    .maybeSingle<{ type: 'dm' | 'group' }>();
  const conversationType = conversationRow?.type === 'group' ? 'group' : 'dm';

  const { data: peerProfile } = peerId
    ? await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .eq('id', peerId)
        .maybeSingle()
    : { data: null };

  const { data: peerPresence } = peerId
    ? await supabase
        .from('user_presence')
        .select('status, last_active_at, updated_at')
        .eq('user_id', peerId)
        .maybeSingle()
    : { data: null };

  const { data: memberProfilesRaw } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, handle, display_name')
        .in('id', memberIds)
    : { data: [] };

  const memberProfiles = Object.fromEntries(
    (memberProfilesRaw ?? [])
      .filter((row) => typeof row.id === 'string')
      .map((row) => [
        row.id as string,
        {
          handle: typeof row.handle === 'string' ? row.handle : null,
          display_name: typeof row.display_name === 'string' ? row.display_name : null
        }
      ])
  );

  let blocked = false;
  if (peerId) {
    const { data: isBlocked } = await supabase.rpc('rpc_is_blocked', {
      p_other_user_id: peerId
    });
    blocked = isBlocked === true;
  }

  const moderatorAccess = await requireModerator(
    supabase,
    session.user.id,
    session.user.email ?? null
  );

  let moderationByUserId: Record<string, { status: 'active' | 'muted' | 'suspended' | 'banned'; until: string | null }> = {};
  const senderIds = Array.from(new Set(pageRows.map((row) => row.sender_id)));
  if (moderatorAccess.ok && senderIds.length) {
    const { data: senderPrefs } = await supabase
      .from('user_preferences')
      .select('user_id, moderation_status, moderation_until')
      .in('user_id', senderIds);

    moderationByUserId = Object.fromEntries(
      (senderPrefs ?? []).map((row) => [
        row.user_id as string,
        {
          status:
            row.moderation_status === 'muted' ||
            row.moderation_status === 'suspended' ||
            row.moderation_status === 'banned'
              ? row.moderation_status
              : 'active',
          until: (row.moderation_until as string | null) ?? null
        }
      ])
    );
  }

  const messageIds = pageRows.map((row) => row.id);
  const { data: attachmentRowsRaw } = messageIds.length
    ? await supabase
        .from('message_attachments')
        .select('id, message_id, kind, url, storage_path, mime_type, width, height, bytes, alt_text, created_at')
        .in('message_id', messageIds)
    : { data: [] };

  const signedAttachments = await resolveAttachmentViewUrls((attachmentRowsRaw ?? []) as AttachmentRow[]);
  const attachmentsByMessageId = new Map<string, AttachmentRow[]>();
  for (const attachment of signedAttachments) {
    const bucket = attachmentsByMessageId.get(attachment.message_id) ?? [];
    bucket.push(attachment);
    attachmentsByMessageId.set(attachment.message_id, bucket);
  }

  const { data: reactionsRaw } = messageIds.length
    ? await supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messageIds)
    : { data: [] };

  const reactionMap: Record<string, Array<{ emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥'; count: number; reacted: boolean }>> = {};
  const reactionBuckets = new Map<string, Map<string, { count: number; reacted: boolean }>>();

  for (const row of (reactionsRaw ?? []) as ReactionRow[]) {
    if (!reactionBuckets.has(row.message_id)) {
      reactionBuckets.set(row.message_id, new Map());
    }

    const bucket = reactionBuckets.get(row.message_id) as Map<string, { count: number; reacted: boolean }>;
    const existing = bucket.get(row.emoji) ?? { count: 0, reacted: false };
    existing.count += 1;
    if (row.user_id === session.user.id) {
      existing.reacted = true;
    }
    bucket.set(row.emoji, existing);
  }

  for (const [messageId, bucket] of reactionBuckets.entries()) {
    reactionMap[messageId] = Array.from(bucket.entries()).map(([emoji, value]) => ({
      emoji: emoji as '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥',
      count: value.count,
      reacted: value.reacted
    }));
  }

  let seenByPeerAt: string | null = null;
  if (conversationType === 'dm' && peerId) {
    const { data: peerMembership } = await supabase
      .from('conversation_members')
      .select('last_read_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', peerId)
      .maybeSingle<{ last_read_at: string | null }>();

    seenByPeerAt = peerMembership?.last_read_at ?? null;
  }

  return json(
    {
      items: [...pageRows].reverse().map((row) => ({
        ...row,
        attachments: attachmentsByMessageId.get(row.id) ?? []
      })),
      nextCursor,
      memberIds,
      memberProfiles,
      conversationType,
      seenByPeerAt,
      peer:
        peerId && peerProfile
          ? {
              id: peerId,
              handle: typeof peerProfile.handle === 'string' ? peerProfile.handle : null,
              display_name: typeof peerProfile.display_name === 'string' ? peerProfile.display_name : null,
              avatar_url: typeof peerProfile.avatar_url === 'string' ? peerProfile.avatar_url : null,
              presence:
                peerPresence &&
                (peerPresence.status === 'online' ||
                  peerPresence.status === 'away' ||
                  peerPresence.status === 'offline') &&
                typeof peerPresence.last_active_at === 'string' &&
                typeof peerPresence.updated_at === 'string'
                  ? {
                      status: peerPresence.status,
                      last_active_at: peerPresence.last_active_at,
                      updated_at: peerPresence.updated_at
                    }
                  : null
            }
          : peerId
            ? {
                id: peerId,
                handle: null,
                display_name: null,
                avatar_url: null,
                presence:
                  peerPresence &&
                  (peerPresence.status === 'online' ||
                    peerPresence.status === 'away' ||
                    peerPresence.status === 'offline') &&
                  typeof peerPresence.last_active_at === 'string' &&
                  typeof peerPresence.updated_at === 'string'
                    ? {
                        status: peerPresence.status,
                        last_active_at: peerPresence.last_active_at,
                        updated_at: peerPresence.updated_at
                      }
                    : null
              }
            : null,
      blocked,
      viewerCanModerate: moderatorAccess.ok,
      moderationByUserId,
      reactionsByMessageId: reactionMap
    },
    { headers: MESSENGER_CACHE_HEADERS }
  );
};
