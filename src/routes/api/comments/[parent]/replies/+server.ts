import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

const parseLimit = (value: string | null, fallback = 20) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const parentId = event.params.parent;
  const limit = parseLimit(event.url.searchParams.get('limit'));
  const before = event.url.searchParams.get('before') ?? new Date().toISOString();

  const { data, error } = await supabase.rpc('get_comment_replies', {
    p_parent_id: parentId,
    p_limit: limit,
    p_before: before
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const items = Array.isArray(data) ? data : [];
  const last = items.length > 0 ? items[items.length - 1] : null;
  const nextCursor =
    items.length === limit ? ((last?.created_at as string | null) ?? null) : null;

  return json({ items, nextCursor });
};
