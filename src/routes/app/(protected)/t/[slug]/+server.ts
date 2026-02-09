import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { appendSearch, canonicalRedirectTarget } from '$lib/threads/redirectHelpers';

export const GET: RequestHandler = async (event) => {
  const { slug } = event.params;
  if (!slug) {
    throw error(400, 'Missing thread slug');
  }

  const supabase = supabaseServer(event);
  const { data, error: dbError } = await supabase
    .from('posts')
    .select(
      `
        id,
        slug,
        author:profiles!posts_author_fk(handle)
      `
    )
    .eq('slug', slug)
    .maybeSingle();

  if (dbError) {
    console.error('[legacy slug redirect] lookup failed', dbError);
    throw error(500, 'Unable to resolve thread');
  }

  if (!data?.id) {
    throw error(404, 'Thread not found');
  }

  try {
    const author = Array.isArray(data.author) ? (data.author[0] ?? null) : data.author;
    const canonical = canonicalRedirectTarget(
      {
        id: data.id,
        slug: data.slug ?? slug,
        author: author ?? null
      },
      data.id
    );
    throw redirect(302, appendSearch(canonical, event.url.search));
  } catch (cause) {
    console.error('[legacy slug redirect] canonical resolution failed', cause);
    throw error(500, 'Unable to resolve thread');
  }
};
