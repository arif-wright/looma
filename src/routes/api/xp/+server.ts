import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: uerr
  } = await supabase.auth.getUser();

  if (uerr) {
    return json({ error: uerr.message }, { status: 400 });
  }

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await event.request.json().catch(() => ({}));
  const amount = Number(body?.amount ?? 25);

  if (!Number.isFinite(amount) || amount === 0) {
    return json({ error: 'amount must be a non-zero number' }, { status: 400 });
  }

  const { data: cur, error: curErr } = await supabase
    .from('profiles')
    .select('xp')
    .eq('id', user.id)
    .single();

  if (curErr) {
    console.error('xp:get current profile failed', curErr);
    return json({ error: curErr.message }, { status: 400 });
  }

  const nextXp = (cur?.xp ?? 0) + amount;

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ xp: nextXp })
    .eq('id', user.id);

  if (updErr) {
    console.error('xp:update profile failed', updErr);
    return json({ error: updErr.message }, { status: 400 });
  }

  return json({ ok: true, added: amount, newXp: nextXp });
};
