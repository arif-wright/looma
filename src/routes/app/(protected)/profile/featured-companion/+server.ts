import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserServer } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
  const { supabase, user } = await requireUserServer(event);

  let payload: { companionId?: unknown } = {};
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  if (!companionId) {
    return json({ error: 'companionId is required' }, { status: 400 });
  }

  const { data: companion, error: companionError } = await supabase
    .from('companions')
    .select('id')
    .eq('id', companionId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (companionError) {
    return json({ error: companionError.message }, { status: 400 });
  }

  if (!companion) {
    return json({ error: 'Companion not found' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ featured_companion_id: companionId })
    .eq('id', user.id);

  if (updateError) {
    return json({ error: updateError.message }, { status: 400 });
  }

  return json({ ok: true });
};
