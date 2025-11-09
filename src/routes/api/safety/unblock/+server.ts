import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type UnblockPayload = { userId?: string };

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: UnblockPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const targetId = typeof body.userId === 'string' ? body.userId : null;

  if (!targetId) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { error } = await supabase
    .from('blocks')
    .delete()
    .match({ blocker_id: session.user.id, blocked_id: targetId });

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
