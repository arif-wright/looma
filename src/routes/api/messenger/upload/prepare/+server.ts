import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient, tryGetSupabaseAdminClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  getConversationMembers,
  getConversationType,
  isConversationMember,
  isUuid
} from '$lib/server/messenger';
import {
  MESSENGER_UPLOAD_BUCKET,
  buildStoragePath,
  buildUploadViewUrl,
  getUploadLimits,
  guessAttachmentKindFromMime,
  isAllowedMimeType
} from '$lib/server/messenger/media';
import { enforceSocialActionAllowed } from '$lib/server/moderation';
import { enforceTrustActionAllowed, getTrust } from '$lib/server/trust';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceMessengerUploadPrepareRateLimit } from '$lib/server/messenger/rate';

type FileInput = {
  name?: string;
  mimeType?: string;
  bytes?: number;
};

type Payload = {
  conversationId?: string;
  files?: FileInput[];
};

const MAX_FILES = 4;

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

  const rate = enforceMessengerUploadPrepareRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  let body: Payload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
  const files = Array.isArray(body.files) ? body.files : [];

  if (!isUuid(conversationId) || !files.length || files.length > MAX_FILES) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const isMember = await isConversationMember(supabase, conversationId, session.user.id);
  if (!isMember) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationType = await getConversationType(supabase, conversationId);
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

  const trust = await getTrust(supabase, session.user.id);
  const trustCheck = await enforceTrustActionAllowed(supabase, session.user.id, {
    scope: 'message_send',
    conversationType: null,
    otherUserId: null
  });
  if (!trustCheck.ok) {
    return json(
      { error: trustCheck.code, message: trustCheck.message, retryAfter: trustCheck.retryAfter },
      { status: trustCheck.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const limits = getUploadLimits(trust.tier);
  if (files.length > limits.maxAttachments) {
    return json(
      {
        error: 'attachment_limit_exceeded',
        message: `You can attach up to ${limits.maxAttachments} file(s) with your current account limits.`
      },
      { status: 400, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const admin = tryGetSupabaseAdminClient();
  if (!admin) {
    return json(
      { error: 'server_misconfigured', message: 'Upload service is unavailable.' },
      { status: 500, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const messageId = crypto.randomUUID();
  const uploads: Array<{
    uploadUrl: string;
    storagePath: string;
    viewUrl: string | null;
    mimeType: string;
    bytes: number;
    kind: 'image' | 'gif';
  }> = [];

  for (const file of files) {
    const name = typeof file.name === 'string' ? file.name : '';
    const mimeType = typeof file.mimeType === 'string' ? file.mimeType.toLowerCase() : '';
    const bytes = typeof file.bytes === 'number' && Number.isFinite(file.bytes) ? Math.floor(file.bytes) : NaN;

    if (!name || !mimeType || !Number.isFinite(bytes) || bytes <= 0) {
      return json({ error: 'bad_request', message: 'Invalid file metadata.' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
    }

    if (!isAllowedMimeType(mimeType)) {
      return json(
        { error: 'unsupported_type', message: `Unsupported mime type: ${mimeType}` },
        { status: 400, headers: MESSENGER_CACHE_HEADERS }
      );
    }

    const limit = mimeType === 'image/gif' ? limits.gifCap : limits.imageCap;
    if (bytes > limit) {
      return json(
        { error: 'file_too_large', message: `File exceeds size limit (${Math.floor(limit / (1024 * 1024))}MB).` },
        { status: 400, headers: MESSENGER_CACHE_HEADERS }
      );
    }

    const storagePath = buildStoragePath(session.user.id, conversationId, messageId, name);
    const { data: signed, error: signedError } = await admin.storage
      .from(MESSENGER_UPLOAD_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signed?.signedUrl) {
      return json(
        { error: 'upload_prepare_failed', message: 'Could not prepare upload URL.' },
        { status: 400, headers: MESSENGER_CACHE_HEADERS }
      );
    }

    const viewUrl = await buildUploadViewUrl(storagePath);
    uploads.push({
      uploadUrl: signed.signedUrl,
      storagePath,
      viewUrl,
      mimeType,
      bytes,
      kind: guessAttachmentKindFromMime(mimeType)
    });
  }

  return json({ uploads }, { headers: MESSENGER_CACHE_HEADERS });
};
