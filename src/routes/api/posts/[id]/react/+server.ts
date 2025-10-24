import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

const VALID_KINDS = new Set(['like', 'spark', 'support']);

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
  let payload: { kind?: unknown };

  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const kind =
    typeof payload.kind === 'string' && VALID_KINDS.has(payload.kind) ? payload.kind : 'like';

  const { error: delError } = await supabase
    .from('post_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id);

  if (delError) {
    return json({ error: delError.message }, { status: 400 });
  }

  const { error: insertError } = await supabase.from('post_reactions').insert({
    post_id: postId,
    user_id: user.id,
    kind
  });

  if (insertError) {
    return json({ error: insertError.message }, { status: 400 });
  }

  return json({ ok: true });
};
