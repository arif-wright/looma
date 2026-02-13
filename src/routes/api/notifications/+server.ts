import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const clampLimit = (value: string | null, fallback = 20) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
};

type PostPayload = {
  action?: 'mark_read' | 'mark_all';
  ids?: unknown;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const limit = clampLimit(event.url.searchParams.get('limit'), 20);
  const before = event.url.searchParams.get('before');

  let query = supabase
    .from('notifications')
    .select(
      'id, user_id, actor_id, kind, target_id, target_kind, created_at, read, metadata, type, title, body, meta, read_at'
    )
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    const beforeTs = Date.parse(before);
    if (Number.isFinite(beforeTs)) {
      query = query.lt('created_at', new Date(beforeTs).toISOString());
    }
  }

  const [itemsResult, unreadResult] = await Promise.all([
    query,
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
  ]);

  if (itemsResult.error || unreadResult.error) {
    return json(
      { error: itemsResult.error?.message ?? unreadResult.error?.message ?? 'server_error' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const rawItems = Array.isArray(itemsResult.data) ? itemsResult.data : [];
  const items = rawItems.map((row) => ({
    ...row,
    metadata:
      row?.metadata && typeof row.metadata === 'object'
        ? row.metadata
        : row?.meta && typeof row.meta === 'object'
          ? row.meta
          : {},
    read: row?.read_at ? true : row?.read === true
  }));

  const unread = unreadResult.count ?? items.filter((item) => !item.read).length;
  const nextCursor = items.length === limit ? (items[items.length - 1]?.created_at as string | undefined) ?? null : null;

  return json({ items, unread, nextCursor }, { headers: CACHE_HEADERS });
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let payload: PostPayload;
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

  const now = new Date().toISOString();
  let query = supabase
    .from('notifications')
    .update({ read: true, read_at: now })
    .eq('user_id', session.user.id)
    .eq('read', false);

  if (payload.action === 'mark_read' && ids && ids.length) {
    query = query.in('id', ids);
  }

  const { error } = await query;
  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
