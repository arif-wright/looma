import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadFocusedPost, handleReplyAction } from '../../focused-load';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const profile = parent.profile;
  const id = event.params.id;

  if (!id) {
    throw error(400, 'Missing post id');
  }

  if (parent.blocked) {
    throw redirect(302, `/app/u/${profile.handle}${event.url.search}`);
  }

  return loadFocusedPost(event, profile, { kind: 'id', id });
};

export const actions = {
  reply: async (event) => {
    const profile = await (async () => {
      const supabase = supabaseServer(event);
      const { data } = await supabase
        .from('profiles')
        .select('id, handle')
        .eq('handle', event.params.handle)
        .maybeSingle();
      return data as { id: string; handle: string } | null;
    })();
    if (!profile) {
      throw error(404, 'Profile not found');
    }
    const id = event.params.id;
    if (!id) {
      throw error(400, 'Missing post id');
    }

    const supabase = supabaseServer(event);
    const { data: postRow, error: lookupError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .eq('author_id', profile.id)
      .maybeSingle();

    if (lookupError) {
      console.error('[profile focused post] id lookup failed', lookupError);
      throw error(500, 'Unable to resolve post');
    }

    if (!postRow?.id) {
      throw error(404, 'Post not found');
    }

    return handleReplyAction(event, postRow.id);
  }
};
