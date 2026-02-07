import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { getAdminFlags } from '$lib/server/admin-guard';

export const load: PageServerLoad = async (event) => {
  const { session } = await createSupabaseServerClient(event);
  if (!session) {
    throw error(401, 'Unauthorized');
  }
  const flags = await getAdminFlags(session.user.email ?? null, session.user.id ?? null);
  if (!flags.isSuper) {
    throw error(404, 'Not found');
  }

  const res = await event.fetch('/api/events/traces?limit=25');
  if (!res.ok) {
    return { items: [] };
  }

  const payload = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
  return {
    items: Array.isArray(payload?.items) ? payload.items : []
  };
};
