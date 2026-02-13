import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  FRIENDS_CACHE_HEADERS,
  resolveRecipientId,
  sanitizeFriendNote
} from '$lib/server/friends';
import { enforceFriendRequestRateLimit } from '$lib/server/friends/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceSocialActionAllowed } from '$lib/server/moderation';
import { enforceTrustActionAllowed } from '$lib/server/trust';

type RequestPayload = {
  recipientId?: string;
  handle?: string;
  note?: string;
};

const mapRequestError = (message: string | undefined) => {
  if (!message) return { status: 400, code: 'bad_request', message: 'Could not send friend request.' };
  if (message.includes('blocked')) return { status: 403, code: 'blocked', message: 'You cannot send a request to this user.' };
  if (message.includes('already_friends')) return { status: 200, code: 'already_friends', message: 'Already friends.' };
  if (message.includes('invalid_recipient')) return { status: 400, code: 'invalid_recipient', message: 'You cannot send a request to yourself.' };
  if (message.includes('user_not_found')) return { status: 404, code: 'user_not_found', message: 'User not found.' };
  return { status: 400, code: 'bad_request', message: 'Could not send friend request.' };
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: FRIENDS_CACHE_HEADERS });
  }

  const moderationCheck = await enforceSocialActionAllowed(
    supabase,
    session.user.id,
    'friend_request'
  );
  if (!moderationCheck.ok) {
    return json(
      {
        error: moderationCheck.code,
        message: moderationCheck.message,
        moderationStatus: moderationCheck.moderationStatus
      },
      { status: moderationCheck.status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  let body: RequestPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request body.' }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const recipientId = await resolveRecipientId(body, supabase);
  if (!recipientId || recipientId === session.user.id) {
    return json(
      { error: 'invalid_recipient', message: 'Please provide a valid recipient.' },
      { status: 400, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  const trustCheck = await enforceTrustActionAllowed(supabase, session.user.id, {
    scope: 'friend_request',
    otherUserId: recipientId
  });
  if (!trustCheck.ok) {
    return json(
      {
        error: trustCheck.code,
        message: trustCheck.message,
        retryAfter: trustCheck.retryAfter,
        trustTier: trustCheck.trust.tier
      },
      { status: trustCheck.status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  const rate = enforceFriendRequestRateLimit(
    session.user.id,
    getClientIp(event),
    trustCheck.trust.tier
  );
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: FRIENDS_CACHE_HEADERS }
    );
  }

  const { data, error } = await supabase.rpc('rpc_send_friend_request', {
    recipient_id: recipientId,
    note: sanitizeFriendNote(body.note)
  });

  if (error) {
    const mapped = mapRequestError(error.message);
    return json({ error: mapped.code, message: mapped.message }, { status: mapped.status, headers: FRIENDS_CACHE_HEADERS });
  }

  const row = Array.isArray(data) ? data[0] : null;
  const status = typeof row?.status === 'string' ? row.status : 'pending';
  const requestId = typeof row?.request_id === 'string' ? row.request_id : null;
  const friendId = typeof row?.friend_id === 'string' ? row.friend_id : null;

  return json(
    {
      ok: true,
      status,
      requestId,
      friendId
    },
    { headers: FRIENDS_CACHE_HEADERS }
  );
};
