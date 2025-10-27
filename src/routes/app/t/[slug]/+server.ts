import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

export const GET: RequestHandler = async (event) => {
  const { slug } = event.params;
  if (!slug) {
    throw error(400, 'Missing thread slug');
  }

  const supabase = supabaseServer(event);
  const { data, error: dbError } = await supabase
    .from('posts')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (dbError) {
    console.error('[thread:slug] lookup failed', dbError);
    throw error(500, 'Unable to resolve thread');
  }

  if (!data?.id) {
    throw error(404, 'Thread not found');
  }

  throw redirect(302, `/app/thread/${data.id}`);
};
