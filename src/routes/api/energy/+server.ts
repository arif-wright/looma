import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('[api/energy] auth.getUser failed', userError);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'unauthorized', message: SAFE_UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const body = await event.request.json().catch(() => ({}));
  const toUser = typeof body?.to === 'string' ? body.to.trim() : '';
  const amount = Number(body?.amount ?? 1);

  if (!toUser) {
    return json({ error: 'Recipient id "to" is required.' }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount < 1 || amount > 10) {
    return json({ error: 'Amount must be between 1 and 10.' }, { status: 400 });
  }

  if (toUser === user.id) {
    return json({ error: 'You cannot send energy to yourself.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('energy_transfers')
    .insert({ from_user: user.id, to_user: toUser, amount });

  if (error) {
    console.error('[api/energy] insert failed', error);
    return json({ error: 'bad_request', message: SAFE_LOAD_MESSAGE }, { status: 400 });
  }

  return json({ ok: true });
};
