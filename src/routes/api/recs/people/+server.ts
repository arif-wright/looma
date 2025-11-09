import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { fetchPeopleRecs } from '$lib/server/recs';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const clampLimit = (value: number) => Math.max(1, Math.min(24, value));

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/recs/people] auth lookup failed', authError);
    return json({ items: [] }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ items: [] }, { status: 401, headers: CACHE_HEADERS });
  }

  const fromParam = Number(event.url.searchParams.get('from') ?? '0');
  const limitParam = Number(event.url.searchParams.get('limit') ?? '12');
  const from = Number.isFinite(fromParam) ? Math.max(0, Math.floor(fromParam)) : 0;
  const limit = Number.isFinite(limitParam) ? clampLimit(Math.floor(limitParam)) : 12;

  const items = await fetchPeopleRecs(supabase, from, limit);
  const next = items.length === limit ? from + limit : null;

  return json({ items, next }, { headers: CACHE_HEADERS });
};
