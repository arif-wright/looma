import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  getConversationMembers,
  getConversationType,
  isConversationMember,
  isUuid
} from '$lib/server/messenger';
import { enforceSocialActionAllowed } from '$lib/server/moderation';
import { enforceMessengerSendRateLimit } from '$lib/server/messenger/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceTrustActionAllowed, getTrust } from '$lib/server/trust';

type Payload = {
  conversationId?: string;
  url?: string;
  width?: number;
  height?: number;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const moderationCheck = await enforceSocialActionAllowed(supabase, session.user.id, 'message_send');
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

  let body: Payload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (!isUuid(conversationId) || !url || !/^https?:\/\//i.test(url)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const isMember = await isConversationMember(supabase, conversationId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  const trust = await getTrust(supabase, session.user.id);
  if (trust.tier === 'restricted') {
    return json(
      {
        error: 'trust_restricted',
        message: 'Your account has temporary limits. Please try again later or contact support.'
      },
      { status: 403, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const conversationType = await getConversationType(supabase, conversationId);
  if (!conversationType) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  if (conversationType === 'dm') {
    const members = await getConversationMembers(supabase, conversationId);
    const peerId = members.find((id) => id !== session.user.id) ?? null;

    const trustCheck = await enforceTrustActionAllowed(supabase, session.user.id, {
      scope: 'message_send',
      conversationType,
      otherUserId: peerId
    });
    if (!trustCheck.ok) {
      return json(
        {
          error: trustCheck.code,
          message: trustCheck.message,
          retryAfter: trustCheck.retryAfter,
          trustTier: trustCheck.trust.tier
        },
        { status: trustCheck.status, headers: MESSENGER_CACHE_HEADERS }
      );
    }

    if (peerId) {
      const { data: blocked } = await supabase.rpc('rpc_is_blocked', {
        p_other_user_id: peerId
      });
      if (blocked === true) {
        return json({ error: 'blocked' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
      }
    }
  }

  const rate = enforceMessengerSendRateLimit(
    session.user.id,
    conversationId,
    getClientIp(event),
    trust.tier
  );
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: session.user.id,
      body: '',
      client_nonce: crypto.randomUUID(),
      has_attachments: true,
      preview_kind: 'gif'
    })
    .select('id, created_at')
    .single<{ id: string; created_at: string }>();

  if (insertError || !inserted?.id) {
    return json({ error: insertError?.message ?? 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  await supabase.from('message_attachments').insert({
    message_id: inserted.id,
    kind: 'gif',
    url,
    mime_type: 'image/gif',
    width: typeof body.width === 'number' ? Math.floor(body.width) : null,
    height: typeof body.height === 'number' ? Math.floor(body.height) : null
  });

  await supabase
    .from('conversations')
    .update({
      last_message_at: inserted.created_at,
      last_message_preview: 'GIF'
    })
    .eq('id', conversationId);

  return json({ ok: true, messageId: inserted.id, createdAt: inserted.created_at }, { headers: MESSENGER_CACHE_HEADERS });
};
