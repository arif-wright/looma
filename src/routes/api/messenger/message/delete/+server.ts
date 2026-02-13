import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  buildMessagePreview,
  isUuid
} from '$lib/server/messenger';

type DeletePayload = {
  messageId?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: DeletePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : null;

  if (!isUuid(messageId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: messageRow } = await supabase
    .from('messages')
    .select('id, sender_id, conversation_id, deleted_at')
    .eq('id', messageId)
    .maybeSingle<{ id: string; sender_id: string; conversation_id: string; deleted_at: string | null }>();

  if (!messageRow) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  if (messageRow.sender_id !== session.user.id) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  if (messageRow.deleted_at) {
    return json({ ok: true, alreadyDeleted: true }, { headers: MESSENGER_CACHE_HEADERS });
  }

  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: deletedAt })
    .eq('id', messageId)
    .is('deleted_at', null);

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: latest } = await supabase
    .from('messages')
    .select('id, body, created_at')
    .eq('conversation_id', messageRow.conversation_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; body: string; created_at: string }>();

  await supabase
    .from('conversations')
    .update({
      last_message_at: latest?.created_at ?? null,
      last_message_preview: latest?.body ? buildMessagePreview(latest.body) : null
    })
    .eq('id', messageRow.conversation_id);

  return json({ ok: true, messageId, deletedAt }, { headers: MESSENGER_CACHE_HEADERS });
};
