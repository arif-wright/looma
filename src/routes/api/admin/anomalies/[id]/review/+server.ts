import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth, getAdminClient } from '$lib/server/games/guard';

const parseList = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const POST: RequestHandler = async (event) => {
  const { user } = await ensureAuth(event);
  const admins = new Set(parseList(env.ADMIN_EMAILS));
  const email = user.email?.toLowerCase() ?? '';

  if (!admins.has(email)) {
    return json({ message: 'Access denied.' }, { status: 403 });
  }

  const id = event.params.id;
  if (!id) {
    return json({ message: 'Missing anomaly id.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const reviewedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from('anomalies')
    .update({ reviewed_at: reviewedAt })
    .eq('id', id);

  if (updateError) {
    console.error('[admin:anomalies] mark reviewed failed', updateError, { id });
    return json({ message: 'Unable to update anomaly.' }, { status: 500 });
  }

  return json({ ok: true, reviewedAt });
};
