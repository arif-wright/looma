import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { validateHandle } from '$lib/utils/handle';

export const POST: RequestHandler = async (event) => {
  const { supabase, user } = await requireUserServer(event);
  const payload = await event.request.json().catch(() => ({}));
  const candidate = typeof payload?.handle === 'string' ? payload.handle : '';
  const validation = validateHandle(candidate);
  if (!validation.ok || !validation.handle) {
    return json({ ok: false, reason: validation.reason }, { status: 400 });
  }

  const handle = validation.handle;

  const { data: reserved } = await supabase
    .from('reserved_handles')
    .select('handle')
    .eq('handle', handle)
    .maybeSingle();

  if (reserved) {
    return json({ ok: false, reason: 'Reserved handle' }, { status: 400 });
  }

  const { error } = await supabase.from('profiles').update({ handle }).eq('id', user.id);

  if (error) {
    const reason = error.code === '23505' ? 'Handle unavailable' : error.message;
    return json({ ok: false, reason }, { status: error.code === '23505' ? 409 : 400 });
  }

  return json({ ok: true, handle });
};
