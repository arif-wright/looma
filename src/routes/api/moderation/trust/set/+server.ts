import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { serviceClient } from '$lib/server/admin';
import { MODERATION_CACHE_HEADERS, isUuid, requireModerator } from '$lib/server/moderation';
import { setForcedTrustTier, type TrustTier } from '$lib/server/trust';

type Payload = {
  userId?: string;
  tier?: 'restricted' | 'standard';
  note?: string;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MODERATION_CACHE_HEADERS });
  }

  const auth = await requireModerator(supabase, session.user.id, session.user.email ?? null);
  if (!auth.ok) {
    return json({ error: 'forbidden' }, { status: 403, headers: MODERATION_CACHE_HEADERS });
  }

  let body: Payload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const userId = typeof body.userId === 'string' ? body.userId : null;
  if (!isUuid(userId)) {
    return json({ error: 'bad_request', message: 'Valid userId is required.' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  if (body.tier !== 'restricted' && body.tier !== 'standard') {
    return json({ error: 'bad_request', message: 'tier must be restricted or standard.' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const forcedTier: TrustTier | null = body.tier === 'restricted' ? 'restricted' : null;
  const admin = serviceClient();
  const trust = await setForcedTrustTier(
    admin,
    userId,
    forcedTier,
    session.user.id,
    typeof body.note === 'string' ? body.note.trim().slice(0, 400) : null
  );

  return json(
    {
      ok: true,
      userId,
      tier: trust.tier,
      forcedTier: trust.forcedTier
    },
    { headers: MODERATION_CACHE_HEADERS }
  );
};
