import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { listTraces } from '$lib/server/agents/traceStore';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const GET: RequestHandler = async (event) => {
  if (!dev) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  const { session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const limitParam = event.url.searchParams.get('limit');
  const limit = limitParam ? Math.min(50, Math.max(1, Number(limitParam))) : 20;

  return json({
    items: listTraces(limit)
  });
};
