import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import type { PostRow } from '$lib/social/types';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseLimit = (value: string | null, fallback = 20) => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

const decodeCursor = (value: string | null) => {
  if (!value) return null;
  const [ts] = value.split('|');
  if (!ts) return null;
  return ts;
};

const encodeCursor = (row: PostRow | null | undefined) =>
  row ? `${row.created_at}|${row.id}` : null;

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const identifier = event.params.author;
  const cursorRaw = event.url.searchParams.get('cursor');
  const limit = parseLimit(event.url.searchParams.get('limit'));

  const before = decodeCursor(cursorRaw) ?? new Date().toISOString();

  const baseQuery = supabase.from('profiles').select('id, handle, is_private').limit(1);
  const filteredQuery = uuidRegex.test(identifier)
    ? baseQuery.eq('id', identifier)
    : baseQuery.eq('handle', identifier.replace(/^@/, ''));
  const { data: profile, error: profileError } = await filteredQuery.maybeSingle();

  if (profileError) {
    return json({ error: profileError.message }, { status: 400 });
  }

  if (!profile) {
    return json({ error: 'Profile not found' }, { status: 404 });
  }

  const viewerId = event.locals.user?.id ?? null;
  const isOwner = viewerId === profile.id;
  if (profile.is_private && !isOwner) {
    return json({ error: 'Profile not found' }, { status: 404 });
  }

  const { data, error } = await supabase.rpc('get_user_posts', {
    p_user: profile.id,
    p_limit: limit,
    p_before: before
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const rows = Array.isArray(data) ? (data as PostRow[]) : [];
  const filtered = isOwner ? rows : rows.filter((row) => row.is_public ?? true);

  return json({
    items: filtered,
    nextCursor: filtered.length === limit ? encodeCursor(filtered.at(-1)) : null
  });
};
