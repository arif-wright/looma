import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS, isUuid } from '$lib/server/messenger';

type ReportPayload = {
  messageId?: string;
  reason?: string;
  details?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  let body: ReportPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const messageId = typeof body.messageId === 'string' ? body.messageId : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const details = typeof body.details === 'string' && body.details.trim() ? body.details.trim().slice(0, 2000) : null;

  if (!isUuid(messageId) || !reason || reason.length > 80) {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data: messageRow, error: messageError } = await supabase
    .from('messages')
    .select('id')
    .eq('id', messageId)
    .is('deleted_at', null)
    .maybeSingle();

  if (messageError) {
    return json({ error: messageError.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  if (!messageRow) {
    return json({ error: 'not_found' }, { status: 404, headers: MESSENGER_CACHE_HEADERS });
  }

  const { error } = await supabase.from('message_reports').insert({
    reporter_id: session.user.id,
    message_id: messageId,
    reason,
    details
  });

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: MESSENGER_CACHE_HEADERS });
};
