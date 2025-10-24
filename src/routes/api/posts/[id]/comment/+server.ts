import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const postId = event.params.id;

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

  const {
    data: inserted,
    error: insertError
  } = await supabase
    .from('comments')
    .insert({
      user_id: user.id,
      target_kind: 'post',
      target_id: postId,
      body
    })
    .select('id, user_id, body, created_at')
    .single();

  if (insertError) {
    return json({ error: insertError.message }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const { count: commentCount, error: commentCountError } = await supabase
    .from('comments')
    .select('id', { head: true, count: 'exact' })
    .eq('target_kind', 'post')
    .eq('target_id', postId);

  if (commentCountError) {
    return json({ error: commentCountError.message }, { status: 400 });
  }

  const { count: likeCount, error: likeCountError } = await supabase
    .from('reactions')
    .select('id', { head: true, count: 'exact' })
    .eq('target_kind', 'post')
    .eq('target_id', postId)
    .eq('kind', 'like');

  if (likeCountError) {
    return json({ error: likeCountError.message }, { status: 400 });
  }

  return json({
    comment: {
      ...inserted,
      display_name: profile?.display_name ?? null,
      handle: profile?.handle ?? null,
      avatar_url: profile?.avatar_url ?? null
    },
    counts: {
      comments: commentCount ?? 0,
      likes: likeCount ?? 0
    }
  });
};
