import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const { count, error: countError } = await supabase
    .from('companions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', session.user.id);

  if (countError) {
    console.error('[persona/spawn] companion count failed', countError);
  }

  if ((count ?? 0) > 0) {
    return json({ error: 'already_spawned' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('match_companion');
  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  return json({
    ok: true,
    companionId: row?.companion_id ?? null,
    archetype: row?.archetype ?? null
  });
};
