import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS, isUuid } from '$lib/server/messenger';

const ALLOWED = new Set(['👍', '❤️', '😂', '😮', '😢', '🔥']);

type ReactPayload = {
  messageId?: string;
  emoji?: string;
  action?: 'add' | 'remove';
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: ReactPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : null;
  const emoji = typeof body.emoji === 'string' ? body.emoji : null;
  const action = body.action === 'add' || body.action === 'remove' ? body.action : null;

  if (!isUuid(messageId) || !emoji || !action || !ALLOWED.has(emoji)) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: messageRow } = await supabase
    .from('messages')
    .select('id, conversation_id')
    .eq('id', messageId)
    .maybeSingle<{ id: string; conversation_id: string }>();

  if (!messageRow) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: membership } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', messageRow.conversation_id)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!membership) {
    return json({ error: 'forbidden' }, { status: 403, headers: MESSENGER_CACHE_HEADERS });
  }

  if (action === 'add') {
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: session.user.id, emoji });

    if (error && error.code !== '23505') {
      return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
    }
  }

  if (action === 'remove') {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', session.user.id)
      .eq('emoji', emoji);

    if (error) {
      return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
    }
  }

  return json({ ok: true }, { headers: MESSENGER_CACHE_HEADERS });
};
