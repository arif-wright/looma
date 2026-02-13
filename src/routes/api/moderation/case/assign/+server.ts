import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { serviceClient } from '$lib/server/admin';
import { MODERATION_CACHE_HEADERS, isUuid, requireModerator } from '$lib/server/moderation';

type AssignPayload = {
  caseId?: string;
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

  let body: AssignPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const caseId = typeof body.caseId === 'string' ? body.caseId : null;
  if (!isUuid(caseId)) {
    return json({ error: 'bad_request', message: 'caseId is required.' }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const admin = serviceClient();
  const { error } = await admin
    .from('moderation_cases')
    .update({
      assigned_to: session.user.id,
      status: 'under_review'
    })
    .eq('id', caseId);

  if (error) {
    return json({ error: error.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  return json({ ok: true, caseId }, { headers: MODERATION_CACHE_HEADERS });
};
