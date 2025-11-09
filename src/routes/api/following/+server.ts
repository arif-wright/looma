import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listFollowing } from '$lib/server/follows';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const parseLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
};

const parseOffset = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export const GET: RequestHandler = async (event) => {
  const userId = event.url.searchParams.get('userId');
  if (!userId) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const limit = parseLimit(event.url.searchParams.get('limit'));
  const offset = parseOffset(event.url.searchParams.get('offset'));

  const { items, nextFrom } = await listFollowing(userId, limit, offset);
  return json({ items, nextOffset: nextFrom }, { headers: CACHE_HEADERS });
};
