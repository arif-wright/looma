import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS, isUuid } from '$lib/server/messenger';

type BlockPayload = {
  blockedUserId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: BlockPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const blockedUserId = typeof body.blockedUserId === 'string' ? body.blockedUserId : null;

  if (!isUuid(blockedUserId) || blockedUserId === session.user.id) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { error } = await supabase
    .from('user_blocks')
    .upsert({ blocker_id: session.user.id, blocked_id: blockedUserId }, { onConflict: 'blocker_id,blocked_id' });

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: MESSENGER_CACHE_HEADERS });
};
