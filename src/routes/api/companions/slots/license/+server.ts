import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('v_inventory_slot_license')
    .select('qty')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    return json({ error: error.message ?? 'license_lookup_failed' }, { status: 400 });
  }

  return json({ qty: data?.qty ?? 0 });
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('consume_slot_license_and_unlock');

  if (error) {
    return json({ error: error.message ?? 'license_consume_failed' }, { status: 400 });
  }

  const maxSlots = Array.isArray(data) ? data[0]?.max_slots : (data as { max_slots?: number } | null)?.max_slots;

  return json({ ok: true, maxSlots: typeof maxSlots === 'number' ? maxSlots : 3 });
};
