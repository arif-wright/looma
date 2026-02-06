import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getContextBundle } from '$lib/server/context/getContextBundle';

export const GET: RequestHandler = async (event) => {
  const { session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const bundle = await getContextBundle(event, { userId: session.user.id });
  return json(bundle);
};
