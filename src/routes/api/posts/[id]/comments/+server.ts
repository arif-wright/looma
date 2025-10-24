import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return json({ error: userError.message }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const postId = event.params.id;
  let payload: { body?: unknown };

  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) {
    return json({ error: 'Body is required' }, { status: 400 });
  }

  const { error } = await supabase.from('post_comments').insert({
    post_id: postId,
    user_id: user.id,
    body
  });

  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  return json({ ok: true });
};
