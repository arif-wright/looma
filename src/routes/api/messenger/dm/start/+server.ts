import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient, tryGetSupabaseAdminClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  isUuid,
  normalizeHandle
} from '$lib/server/messenger';
import { getClientIp } from '$lib/server/utils/ip';
import { enforceMessengerStartDmRateLimit } from '$lib/server/messenger/rate';

type StartDmPayload = {
  otherUserId?: string;
  handle?: string;
};

const resolveOtherUserId = async (
  payload: StartDmPayload,
  fallbackSupabase: App.Locals['supabase']
): Promise<string | null> => {
  if (typeof payload.otherUserId === 'string' && isUuid(payload.otherUserId)) {
    return payload.otherUserId;
  }

  const normalizedHandle = normalizeHandle(payload.handle ?? null);
  if (!normalizedHandle) return null;

  const admin = tryGetSupabaseAdminClient();
  const client = admin ?? fallbackSupabase;
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .ilike('handle', normalizedHandle)
    .maybeSingle();

  if (error) {
    console.error('[messenger/start] handle lookup failed', error);
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const rate = enforceMessengerStartDmRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  let body: StartDmPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const otherUserId = await resolveOtherUserId(body, supabase);
  if (!otherUserId || otherUserId === session.user.id) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: blocked, error: blockedError } = await supabase.rpc('rpc_is_blocked', {
    p_other_user_id: otherUserId
  });

  if (blockedError) {
    console.error('[messenger/start] block lookup failed', blockedError);
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  if (blocked === true) {
    return json({ error: 'blocked' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: conversationId, error } = await supabase.rpc('rpc_get_or_create_dm', {
    other_user_id: otherUserId
  });

  if (error || typeof conversationId !== 'string') {
    const code = error?.message.includes('blocked') ? 'blocked' : 'bad_request';
    const status = code === 'blocked' ? 403 : 400;
    return json({ error: code }, { status, headers: MESSENGER_CACHE_HEADERS });
  }

  return json({ conversationId }, { headers: MESSENGER_CACHE_HEADERS });
};
