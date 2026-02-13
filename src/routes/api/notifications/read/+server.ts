import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type ReadPayload = {
  notificationId?: string;
  all?: boolean;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: ReadPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const now = new Date().toISOString();

  if (body.all === true) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: now })
      .eq('user_id', session.user.id)
      .eq('read', false);

    if (error) {
      return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
    }

    return json({ ok: true, all: true }, { headers: CACHE_HEADERS });
  }

  const notificationId = typeof body.notificationId === 'string' ? body.notificationId : null;
  if (!notificationId) {
    return json({ error: 'bad_request', message: 'notificationId is required.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true, read_at: now })
    .eq('id', notificationId)
    .eq('user_id', session.user.id);

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true, notificationId }, { headers: CACHE_HEADERS });
};
