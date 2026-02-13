import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  buildMessagePreview,
  getConversationMembers,
  getConversationType,
  isConversationMember,
  isUuid,
  sanitizeBody
} from '$lib/server/messenger';
import { enforceMessengerSendRateLimit } from '$lib/server/messenger/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceSocialActionAllowed } from '$lib/server/moderation';

type SendPayload = {
  conversationId?: string;
  body?: string;
  clientNonce?: string;
};

type InsertedMessageRow = {
  id: string;
  created_at: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const moderationCheck = await enforceSocialActionAllowed(
    supabase,
    session.user.id,
    'message_send'
  );
  if (!moderationCheck.ok) {
    return json(
      {
        error: moderationCheck.code,
        message: moderationCheck.message,
        moderationStatus: moderationCheck.moderationStatus
      },
      { status: moderationCheck.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  let body: SendPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
  const messageBody = sanitizeBody(body.body);
  const clientNonce =
    typeof body.clientNonce === 'string' && body.clientNonce.trim().length > 0
      ? body.clientNonce.trim().slice(0, 120)
      : null;

  if (!isUuid(conversationId) || !messageBody) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const isMember = await isConversationMember(supabase, conversationId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  const rate = enforceMessengerSendRateLimit(session.user.id, conversationId, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const conversationType = await getConversationType(supabase, conversationId);
  if (!conversationType) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  if (conversationType === 'dm') {
    const members = await getConversationMembers(supabase, conversationId);
    const peerId = members.find((id) => id !== session.user.id) ?? null;
    if (peerId) {
      const { data: blocked } = await supabase.rpc('rpc_is_blocked', {
        p_other_user_id: peerId
      });
      if (blocked === true) {
        return json({ error: 'blocked' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
      }
    }
  }

  const insertPayload = {
    conversation_id: conversationId,
    sender_id: session.user.id,
    body: messageBody,
    ...(clientNonce ? { client_nonce: clientNonce } : {})
  };

  const { data: insertedRaw, error: insertError } = await supabase
    .from('messages')
    .insert(insertPayload)
    .select('id, created_at')
    .single();

  const inserted = insertedRaw as InsertedMessageRow | null;

  if (insertError) {
    if (insertError.code === '23505' && clientNonce) {
      const { data: existingRaw } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_id', session.user.id)
        .eq('client_nonce', clientNonce)
        .maybeSingle();
      const existing = existingRaw as InsertedMessageRow | null;

      if (existing) {
        return json(
          {
            messageId: existing.id,
            createdAt: existing.created_at,
            idempotent: true
          },
          { headers: MESSENGER_CACHE_HEADERS }
        );
      }
    }

    return json({ error: insertError.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  if (!inserted) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  await supabase
    .from('conversations')
    .update({
      last_message_at: inserted.created_at,
      last_message_preview: buildMessagePreview(messageBody)
    })
    .eq('id', conversationId);

  await supabase
    .from('conversation_members')
    .update({ last_read_at: inserted.created_at })
    .eq('conversation_id', conversationId)
    .eq('user_id', session.user.id);

  return json(
    {
      messageId: inserted.id,
      createdAt: inserted.created_at
    },
    { headers: MESSENGER_CACHE_HEADERS }
  );
};
