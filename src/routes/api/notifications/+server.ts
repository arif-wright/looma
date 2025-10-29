import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { markNotificationsRead } from '$lib/server/notifications';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const { data, error } = await supabase.rpc('get_notifications_for_user', {
    p_user: user.id,
    p_limit: 20
  });

  if (error) {
    console.error('[api/notifications] fetch failed', error);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  const items = Array.isArray(data) ? data : [];
  const unread = items.filter((item) => item?.read === false).length;

  return json({ items, unread }, { headers: CACHE_HEADERS });
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: { action?: string; ids?: unknown };
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400, headers: CACHE_HEADERS });
  }

  if (payload.action !== 'mark_read' && payload.action !== 'mark_all') {
    return json({ error: 'bad_request', details: 'Unsupported action' }, { status: 400, headers: CACHE_HEADERS });
  }

  const ids =
    payload.action === 'mark_read' && Array.isArray(payload.ids)
      ? payload.ids.filter((id): id is string => typeof id === 'string')
      : undefined;

  await markNotificationsRead(supabase, user.id, ids);

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
