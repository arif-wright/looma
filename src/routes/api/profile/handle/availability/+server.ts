import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeHandle } from '$lib/utils/handle';

export const GET: RequestHandler = async ({ url, locals }) => {
  const query = normalizeHandle(url.searchParams.get('q') ?? '');
  if (!query) {
    return json({ available: false, reason: 'Invalid handle' }, { status: 400 });
  }

  const supabase = locals.supabase;
  if (!supabase) {
    return json({ error: 'Missing Supabase client' }, { status: 500 });
  }

  const { data: reserved } = await supabase
    .from('reserved_handles')
    .select('handle')
    .eq('handle', query)
    .maybeSingle();
  if (reserved) {
    return json({ available: false, reason: 'Reserved' });
  }

  const { data: existing, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('handle', query)
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ available: !existing });
};
