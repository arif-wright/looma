import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type BlockPayload = { userId?: string };

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: BlockPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const targetId = typeof body.userId === 'string' ? body.userId : null;

  if (!targetId || targetId === session.user.id) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { error } = await supabase.from('blocks').insert({
    blocker_id: session.user.id,
    blocked_id: targetId
  });

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  await supabase
    .from('follows')
    .delete()
    .or(
      `and(follower_id.eq.${session.user.id},followee_id.eq.${targetId}),and(follower_id.eq.${targetId},followee_id.eq.${session.user.id})`
    );

  await supabase
    .from('follow_requests')
    .delete()
    .or(
      `and(requester_id.eq.${session.user.id},target_id.eq.${targetId}),and(requester_id.eq.${targetId},target_id.eq.${session.user.id})`
    );

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
