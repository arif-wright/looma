import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const ALLOWED_CATEGORIES = new Set(['bug', 'idea', 'ux', 'content', 'other']);
const MAX_MESSAGE_LENGTH = 1500;

type FeedbackPayload = {
  message?: unknown;
  category?: unknown;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: FeedbackPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const categoryRaw = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  const category = categoryRaw.length > 0 ? categoryRaw : null;

  if (!message) {
    return json(
      { error: 'bad_request', message: 'Please include feedback text.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return json(
      { error: 'bad_request', message: `Feedback must be ${MAX_MESSAGE_LENGTH} characters or less.` },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  if (category !== null && !ALLOWED_CATEGORIES.has(category)) {
    return json(
      { error: 'bad_request', message: 'Unsupported category.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const { error } = await supabase.from('user_feedback').insert({
    user_id: session.user.id,
    category,
    message,
    source: 'in_app'
  });

  if (error) {
    console.error('[feedback] insert failed', error);
    return json(
      { error: 'server_error', message: 'Could not send feedback right now. Please try again.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
