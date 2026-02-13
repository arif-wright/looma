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
import {
  enforceMessengerAttachmentSendRateLimit,
  enforceMessengerSendRateLimit
} from '$lib/server/messenger/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceSocialActionAllowed } from '$lib/server/moderation';
import { enforceTrustActionAllowed, getTrust } from '$lib/server/trust';
import {
  getUploadLimits,
  normalizeAttachmentInput,
  resolveAttachmentViewUrls,
  type AttachmentKind,
  type MessageAttachmentInput,
  type MessageAttachmentRow
} from '$lib/server/messenger/media';

type SendPayload = {
  conversationId?: string;
  body?: string;
  clientNonce?: string;
  attachments?: MessageAttachmentInput[];
};

type InsertedMessageRow = {
  id: string;
  created_at: string;
};

const attachmentPreview = (attachments: Array<{ kind: AttachmentKind }>) => {
  if (!attachments.length) return null;
  if (attachments.some((entry) => entry.kind === 'gif')) return 'GIF';
  if (attachments.some((entry) => entry.kind === 'image')) return '📷 Photo';
  return 'Attachment';
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

  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!isUuid(conversationId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const isMember = await isConversationMember(supabase, conversationId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  const trust = await getTrust(supabase, session.user.id);
  const limits = getUploadLimits(trust.tier);

  const attachments = rawAttachments
    .map((entry) => normalizeAttachmentInput(entry))
    .filter((entry): entry is NonNullable<ReturnType<typeof normalizeAttachmentInput>> => Boolean(entry));

  if (!messageBody && attachments.length === 0) {
    return json(
      { error: 'bad_request', message: 'Message text or attachment is required.' },
      { status: 400, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  if (attachments.length > limits.maxAttachments) {
    return json(
      {
        error: 'attachment_limit_exceeded',
        message: `You can attach up to ${limits.maxAttachments} file(s) with your current account limits.`
      },
      { status: 400, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  if (trust.tier === 'restricted' && attachments.some((entry) => entry.kind === 'gif')) {
    return json(
      {
        error: 'trust_restricted',
        message: 'Your account has temporary limits. Please try again later or contact support.'
      },
      { status: 403, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  for (const attachment of attachments) {
    if (attachment.storagePath) {
      const expectedPrefix = `${session.user.id}/${conversationId}/`;
      if (!attachment.storagePath.startsWith(expectedPrefix)) {
        return json(
          { error: 'bad_request', message: 'Invalid attachment path.' },
          { status: 400, headers: MESSENGER_CACHE_HEADERS }
        );
      }
    }

    if (attachment.bytes) {
      const cap = attachment.kind === 'gif' ? limits.gifCap : limits.imageCap;
      if (attachment.bytes > cap) {
        return json(
          { error: 'file_too_large', message: 'Attachment exceeds size limit.' },
          { status: 400, headers: MESSENGER_CACHE_HEADERS }
        );
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

  if (attachments.length > 0) {
    const attachmentRate = enforceMessengerAttachmentSendRateLimit(
      session.user.id,
      getClientIp(event)
    );
    if (!attachmentRate.ok) {
      return json(
        {
          error: attachmentRate.code,
          message: attachmentRate.message,
          retryAfter: attachmentRate.retryAfter
        },
        { status: attachmentRate.status, headers: MESSENGER_CACHE_HEADERS }
      );
    }
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

  const previewFromAttachments = attachmentPreview(attachments);
  const messageText = messageBody ?? '';

  const insertPayload = {
    conversation_id: conversationId,
    sender_id: session.user.id,
    body: messageText,
    has_attachments: attachments.length > 0,
    preview_kind: attachments.some((entry) => entry.kind === 'gif')
      ? 'gif'
      : attachments.length > 0
        ? 'image'
        : 'text',
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

  let insertedAttachments: Array<MessageAttachmentRow & { view_url: string }> = [];

  if (attachments.length > 0) {
    const attachmentInsert = attachments.map((entry) => ({
      message_id: inserted.id,
      kind: entry.kind,
      url: entry.storagePath ?? entry.url ?? '',
      storage_path: entry.storagePath ?? null,
      mime_type: entry.mimeType ?? null,
      width: entry.width ?? null,
      height: entry.height ?? null,
      bytes: entry.bytes ?? null,
      alt_text: entry.altText ?? null
    }));

    const { data: attachmentRows, error: attachmentError } = await supabase
      .from('message_attachments')
      .insert(attachmentInsert)
      .select('id, message_id, kind, url, storage_path, mime_type, width, height, bytes, alt_text, created_at');

    if (attachmentError) {
      await supabase.from('messages').delete().eq('id', inserted.id);
      return json(
        { error: 'bad_request', message: 'Failed to attach files to message.' },
        { status: 400, headers: MESSENGER_CACHE_HEADERS }
      );
    }

    insertedAttachments = await resolveAttachmentViewUrls((attachmentRows ?? []) as MessageAttachmentRow[]);
  }

  await supabase
    .from('conversations')
    .update({
      last_message_at: inserted.created_at,
      last_message_preview: messageBody ? buildMessagePreview(messageBody) : (previewFromAttachments ?? null)
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
      createdAt: inserted.created_at,
      attachments: insertedAttachments
    },
    { headers: MESSENGER_CACHE_HEADERS }
  );
};
