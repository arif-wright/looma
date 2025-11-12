import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

type ReorderPayload = {
  order?: string[];
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: ReorderPayload;
  try {
    payload = (await event.request.json()) as ReorderPayload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const order = Array.isArray(payload.order) ? payload.order.filter((id): id is string => typeof id === 'string') : [];
  if (!order.length) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { error } = await supabase.rpc('reorder_companions', { p_order: order });
  if (error) {
    return json({ error: error.message ?? 'reorder_failed' }, { status: 400 });
  }

  return json({ ok: true });
};
