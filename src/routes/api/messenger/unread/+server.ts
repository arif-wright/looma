import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS } from '$lib/server/messenger';

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const { data, error } = await supabase.rpc('rpc_get_unread_counts');
  if (error) {
    return json({ error: error.message }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const totalUnread = Array.isArray(data)
    ? data.reduce((sum, row) => {
        const count = Number((row as { unread_count?: unknown }).unread_count ?? 0);
        return sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
      }, 0)
    : 0;

  return json({ totalUnread }, { headers: MESSENGER_CACHE_HEADERS });
};

