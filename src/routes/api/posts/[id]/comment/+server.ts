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

  let payload: { body?: unknown; parent_id?: unknown };
  try {
    payload = await event.request.json();
  } catch (cause) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) {
    return json({ error: 'Body is required' }, { status: 400 });
  }

  const parentId = typeof payload.parent_id === 'string' && payload.parent_id.trim() !== ''
    ? payload.parent_id
    : null;

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from('comments')
      .select('id, target_kind, target_id, parent_id')
      .eq('id', parentId)
      .maybeSingle();

    if (parentError) {
      return json({ error: parentError.message }, { status: 400 });
    }

    if (!parent || parent.target_kind !== 'post' || parent.target_id !== postId) {
      return json({ error: 'Invalid parent comment' }, { status: 400 });
    }

    if (parent.parent_id) {
      return json({ error: 'Replies may only nest one level' }, { status: 400 });
    }
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
      parent_id: parentId,
      body
    })
    .select('id, user_id, body, created_at, parent_id')
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
      avatar_url: profile?.avatar_url ?? null,
      reply_count: 0
    },
    counts: {
      comments: commentCount ?? 0,
      likes: likeCount ?? 0
    }
  });
};
