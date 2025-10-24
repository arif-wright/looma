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

  let liked = false;

  const { data: existing, error: existingError } = await supabase
    .from('reactions')
    .select('id')
    .eq('target_kind', 'post')
    .eq('target_id', postId)
    .eq('user_id', user.id)
    .eq('kind', 'like')
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    return json({ error: existingError.message }, { status: 400 });
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from('reactions')
      .delete()
      .eq('id', existing.id);

    if (deleteError) {
      return json({ error: deleteError.message }, { status: 400 });
    }
    liked = false;
  } else {
    const { error: insertError } = await supabase.from('reactions').insert({
      user_id: user.id,
      target_kind: 'post',
      target_id: postId,
      kind: 'like'
    });

    if (insertError) {
      return json({ error: insertError.message }, { status: 400 });
    }
    liked = true;
  }

  const { count: likeCount, error: countError } = await supabase
    .from('reactions')
    .select('id', { head: true, count: 'exact' })
    .eq('target_kind', 'post')
    .eq('target_id', postId)
    .eq('kind', 'like');

  if (countError) {
    return json({ error: countError.message }, { status: 400 });
  }

  return json({ liked, likes: likeCount ?? 0 });
};
