import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS, isUuid } from '$lib/server/messenger';

type ReadPayload = {
  conversationId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: ReadPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
  if (!isUuid(conversationId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { error } = await supabase.rpc('rpc_mark_conversation_read', {
    p_conversation_id: conversationId
  });

  if (error) {
    const status = error.message.includes('not_member') ? 403 : 400;
    return json({ error: error.message }, { status, headers: MESSENGER_CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: MESSENGER_CACHE_HEADERS });
};
