import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { MESSENGER_CACHE_HEADERS } from '$lib/server/messenger';
import { enforceMessengerGifSearchRateLimit } from '$lib/server/messenger/rate';
import { getClientIp } from '$lib/server/utils/ip';
import { getTrust } from '$lib/server/trust';

type Payload = {
  q?: string;
  limit?: number;
};

const parseLimit = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(30, Math.floor(value)));
};

const searchTenor = async (q: string, limit: number) => {
  const key = env.TENOR_API_KEY;
  if (!key) return null;

  const url = new URL('https://tenor.googleapis.com/v2/search');
  url.searchParams.set('q', q);
  url.searchParams.set('key', key);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('media_filter', 'gif,tinygif,tinymp4');
  url.searchParams.set('contentfilter', 'medium');

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];
  }

  const payload = (await res.json()) as {
    results?: Array<{
      id?: string;
      media_formats?: Record<string, { url?: string; preview?: string; dims?: [number, number] }>;
    }>;
  };

  return (payload.results ?? [])
    .map((item) => {
      const gif = item.media_formats?.gif;
      const tiny = item.media_formats?.tinygif ?? item.media_formats?.tinymp4;
      if (!item.id || !gif?.url) return null;
      return {
        id: item.id,
        url: gif.url,
        previewUrl: tiny?.url ?? gif.url,
        width: Array.isArray(gif.dims) ? gif.dims[0] ?? null : null,
        height: Array.isArray(gif.dims) ? gif.dims[1] ?? null : null
      };
    })
    .filter((row): row is { id: string; url: string; previewUrl: string; width: number | null; height: number | null } => Boolean(row));
};

const searchGiphy = async (q: string, limit: number) => {
  const key = env.GIPHY_API_KEY;
  if (!key) return null;

  const url = new URL('https://api.giphy.com/v1/gifs/search');
  url.searchParams.set('q', q);
  url.searchParams.set('api_key', key);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('rating', 'pg-13');

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];
  }

  const payload = (await res.json()) as {
    data?: Array<{
      id?: string;
      images?: {
        original?: { url?: string; width?: string; height?: string };
        fixed_width_still?: { url?: string };
      };
    }>;
  };

  return (payload.data ?? [])
    .map((item) => {
      const original = item.images?.original;
      if (!item.id || !original?.url) return null;
      return {
        id: item.id,
        url: original.url,
        previewUrl: item.images?.fixed_width_still?.url ?? original.url,
        width: original.width ? Number.parseInt(original.width, 10) : null,
        height: original.height ? Number.parseInt(original.height, 10) : null
      };
    })
    .filter((row): row is { id: string; url: string; previewUrl: string; width: number | null; height: number | null } => Boolean(row));
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MESSENGER_CACHE_HEADERS });
  }

  const trust = await getTrust(supabase, session.user.id);
  if (trust.tier === 'restricted') {
    return json(
      {
        error: 'trust_restricted',
        message: 'Your account has temporary limits. Please try again later or contact support.'
      },
      { status: 403, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  const rate = enforceMessengerGifSearchRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: MESSENGER_CACHE_HEADERS }
    );
  }

  let body: Payload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const q = typeof body.q === 'string' ? body.q.trim() : '';
  if (q.length < 2) {
    return json({ error: 'bad_request', message: 'Query must be at least 2 characters.' }, { status: 400, headers: MESSENGER_CACHE_HEADERS });
  }

  const limit = parseLimit(body.limit);

  const providerResults = (await searchTenor(q, limit)) ?? (await searchGiphy(q, limit));
  if (providerResults === null) {
    return json({ disabled: true, results: [] }, { headers: MESSENGER_CACHE_HEADERS });
  }

  return json({ disabled: false, results: providerResults }, { headers: MESSENGER_CACHE_HEADERS });
};
