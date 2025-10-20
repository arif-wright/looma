import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const GET: RequestHandler = async (event) => {
  const sb = supabaseServer(event);
  const user = event.url.searchParams.get('user');
  const before = event.url.searchParams.get('before') ?? new Date().toISOString();

  if (!user) {
    return json({ error: 'user parameter is required' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('get_user_public_feed', {
    p_user: user,
    p_limit: 12,
    p_before: before
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json(data ?? []);
};
