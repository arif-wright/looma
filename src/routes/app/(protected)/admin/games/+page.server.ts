import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ensureAuth, getAdminClient } from '$lib/server/games/guard';

const parseList = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const load: PageServerLoad = async (event) => {
  const { user } = await ensureAuth(event);
  const admins = new Set(parseList(env.ADMIN_EMAILS));
  const userEmail = user.email?.toLowerCase() ?? '';

  if (!admins.has(userEmail)) {
    throw error(403, { message: 'Access denied.' });
  }

  const url = event.url;
  const sessionFilter = url.searchParams.get('session') ?? null;
  const userFilter = url.searchParams.get('user') ?? null;
  const eventFilter = url.searchParams.get('event') ?? null;

  const query = getAdminClient()
    .from('game_audit')
    .select('id, user_id, session_id, event, ip, details, inserted_at')
    .order('inserted_at', { ascending: false })
    .limit(100);

  if (sessionFilter) {
    query.eq('session_id', sessionFilter);
  }

  if (userFilter) {
    query.eq('user_id', userFilter);
  }

  if (eventFilter) {
    query.eq('event', eventFilter);
  }

  const { data, error: auditError } = await query;

  if (auditError) {
    console.error('[games:admin] audit fetch failed', auditError);
    throw error(500, { message: 'Unable to load audit log' });
  }

  return {
    audit: (data ?? []).map((row) => ({
      ...row,
      ip: (row.ip as string | null) ?? null,
      details: row.details ?? {}
    })),
    filters: {
      session: sessionFilter,
      user: userFilter,
      event: eventFilter
    }
  };
};
