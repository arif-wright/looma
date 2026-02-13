import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import {
  MESSENGER_CACHE_HEADERS,
  buildMessagePreview,
  isUuid,
  sanitizeBody
} from '$lib/server/messenger';

const EDIT_WINDOW_MS = 10 * 60 * 1000;

type EditPayload = {
  messageId?: string;
  body?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: EditPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : null;
  const nextBody = sanitizeBody(body.body);

  if (!isUuid(messageId) || !nextBody) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: messageRow } = await supabase
    .from('messages')
    .select('id, sender_id, conversation_id, created_at, deleted_at')
    .eq('id', messageId)
    .maybeSingle<{ id: string; sender_id: string; conversation_id: string; created_at: string; deleted_at: string | null }>();

  if (!messageRow) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  if (messageRow.sender_id !== session.user.id) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  if (messageRow.deleted_at) {
    return json({ error: 'message_deleted' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  if (Date.now() - Date.parse(messageRow.created_at) > EDIT_WINDOW_MS) {
    return json(
      { error: 'edit_window_expired', message: 'Messages can only be edited within 10 minutes.' },
      { status: 400, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const editedAt = new Date().toISOString();
  const { error } = await supabase
    .from('messages')
    .update({ body: nextBody, edited_at: editedAt })
    .eq('id', messageId)
    .is('deleted_at', null);

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: latest } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', messageRow.conversation_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (latest?.id === messageId) {
    await supabase
      .from('conversations')
      .update({ last_message_preview: buildMessagePreview(nextBody) })
      .eq('id', messageRow.conversation_id);
  }

  return json({ ok: true, messageId, editedAt }, { headers: MESSENGER_CACHE_HEADERS });
};
