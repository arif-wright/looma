import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

const MAX_RESULTS = 10;

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const raw = event.url.searchParams.get('q') ?? '';
  const query = raw.trim().replace(/^@+/, '');

  if (query.length < 2) {
    return json({ items: [] });
  }

  const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const likePattern = `${escaped}%`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, author_handle:handle, author_display_name:display_name, author_avatar_url:avatar_url')
    .or(`handle.ilike.${likePattern},display_name.ilike.${likePattern}`)
    .order('handle', { ascending: true })
    .limit(MAX_RESULTS);

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ items: data ?? [] });
};
