import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getCompanionRituals } from '$lib/server/companions/rituals';

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const rituals = await getCompanionRituals(supabase, session.user.id);
  return json({ rituals });
};
