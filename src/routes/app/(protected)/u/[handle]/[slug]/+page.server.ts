import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadFocusedPost, handleReplyAction } from '../focused-load';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const profile = parent.profile;
  const slug = event.params.slug;

  if (!slug) {
    throw error(400, 'Missing post slug');
  }

  return loadFocusedPost(event, profile, { kind: 'slug', slug });
};

export const actions = {
  reply: async (event) => {
    const parent = await event.parent();
    const profile = parent.profile;
    const slug = event.params.slug;
    if (!slug) {
      throw error(400, 'Missing post slug');
    }

    const supabase = supabaseServer(event);
    const { data: postRow, error: lookupError } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', profile.id)
      .eq('slug', slug)
      .maybeSingle();

    if (lookupError) {
      console.error('[profile focused post] slug lookup failed', lookupError);
      throw error(500, 'Unable to resolve post');
    }

    if (!postRow?.id) {
      throw error(404, 'Post not found');
    }

    return handleReplyAction(event, postRow.id);
  }
};
