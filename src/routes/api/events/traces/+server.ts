import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTraces } from '$lib/server/agents/traceStore';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getAdminFlags } from '$lib/server/admin-guard';

export const GET: RequestHandler = async (event) => {
  const { session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const flags = await getAdminFlags(session.user.email ?? null, session.user.id ?? null);
  if (!flags.isSuper) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const limitParam = event.url.searchParams.get('limit');
  const limit = limitParam ? Math.min(50, Math.max(1, Number(limitParam))) : 20;

  return json({
    items: listTraces(limit)
  });
};
