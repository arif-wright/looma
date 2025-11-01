import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser, takeRateLimit } from '$lib/server/games/guard';
import { supabaseAdmin } from '$lib/server/supabase';
import { memoryStore } from '$lib/server/games/store';

const LIMIT = 10;
const WINDOW_MS = 60_000;

export const POST: RequestHandler = async (event) => {
  let body: { slug?: unknown; clientVersion?: unknown };

  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400 });
  }

  const { user, supabase } = await requireUser(event);

  const rate = takeRateLimit(`games:start:${user.id}`, LIMIT, WINDOW_MS);
  if (!rate.allowed) {
    return json(
      { error: 'rate_limited', retryAfter: rate.retryAfter },
      { status: 429, headers: { 'retry-after': `${rate.retryAfter}` } }
    );
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion.trim() : null;

  if (!slug) {
    return json({ error: 'bad_request', details: 'slug is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('fn_game_start', { p_slug: slug });

  if (error || !data || data.length === 0) {
    console.warn('[games] falling back to in-memory session store', error);
    const fallback = memoryStore.createSession(user.id, slug);
    return json({ sessionId: fallback.id, nonce: fallback.nonce, fallback: true });
  }

  const session = data[0];

  if (clientVersion) {
    const { error: updateError } = await supabaseAdmin
      .from('game_sessions')
      .update({ client_ver: clientVersion })
      .eq('id', session.session_id);

    if (updateError) {
      console.warn('[games] unable to persist client version', updateError);
    }
  }

  return json({ sessionId: session.session_id, nonce: session.nonce });
};
