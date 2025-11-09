import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const { kind, meta } = await event.request.json();
  if (!kind) return json({ error: 'bad_request' }, { status: 400 });

  const { error } = await supabase.from('events').insert({
    user_id: session.user.id,
    kind,
    meta
  });
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
};
