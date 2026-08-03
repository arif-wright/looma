import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { json, type RequestHandler } from '@sveltejs/kit';
import { isWorldEnabled } from '$lib/game/featureFlag';
import { issueWorldTicket, normalizeWorldIdentity } from '$lib/server/worldTicket';
import { resolveWorldCompanionProjection, type WorldCompanionRow } from '$lib/server/worldCompanion';

export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
  if (!isWorldEnabled(publicEnv.PUBLIC_WORLD_ENABLED)) {
    return json({ error: 'world_unavailable' }, { status: 404 });
  }
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return json({ error: 'invalid_origin' }, { status: 403 });
  const secret = env.WORLD_JOIN_SECRET;
  if (!secret || secret.length < 32) {
    return json({ error: 'ticket_service_unavailable' }, { status: 503 });
  }

  const { data, error } = await locals.supabase
    .from('profiles')
    .select('id, display_name, handle, account_private')
    .eq('id', locals.user.id)
    .maybeSingle();
  if (error) return json({ error: 'identity_unavailable' }, { status: 503 });
  if (data?.id && data.id !== locals.user.id) return json({ error: 'identity_mismatch' }, { status: 403 });

  const { data: companionRows, error: companionError } = await locals.supabase
    .from('companions')
    .select('id, owner_id, name, species, is_active, slot_index')
    .eq('owner_id', locals.user.id)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .limit(16);
  const companion = resolveWorldCompanionProjection(
    locals.user.id,
    companionRows as WorldCompanionRow[] | null,
    !companionError
  );

  const issued = issueWorldTicket(
    locals.user.id,
    data?.account_private
      ? { displayName: 'Explorer', handle: null }
      : normalizeWorldIdentity(data ?? {}),
    companion,
    secret
  );
  return json(issued, {
    headers: { 'cache-control': 'no-store, private', pragma: 'no-cache' }
  });
};
