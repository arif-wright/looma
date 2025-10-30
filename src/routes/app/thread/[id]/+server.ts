import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { appendSearch, canonicalRedirectTarget } from '$lib/threads/redirectHelpers';

export const GET: RequestHandler = async (event) => {
  const { id } = event.params;
  if (!id) {
    throw error(400, 'Missing thread id');
  }

  const supabase = supabaseServer(event);
  const { data, error: lookupError } = await supabase
    .from('posts')
    .select(
      `
        id,
        slug,
        author:profiles!posts_author_fk(handle)
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    console.error('[legacy thread redirect] lookup failed', lookupError);
    throw error(500, 'Unable to resolve thread');
  }

  if (!data?.id) {
    throw error(404, 'Thread not found');
  }

  let canonical: string;

  try {
    canonical = canonicalRedirectTarget(
      {
        id: data.id,
        slug: data.slug,
        author: data.author ?? null
      },
      data.id
    );
  } catch (cause) {
    console.error('[legacy thread redirect] canonical resolution failed', cause);
    throw error(500, 'Unable to resolve thread');
  }

  throw redirect(302, appendSearch(canonical, event.url.search));
};
