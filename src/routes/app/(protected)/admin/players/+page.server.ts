import type { Actions, PageServerLoad } from './$types';
import type { User } from '@supabase/supabase-js';
import { error, fail } from '@sveltejs/kit';
import { assertSuperAdmin, getAdminServiceClient } from '$lib/server/admin';

type NumberRecord = Record<string, number>;

export const load: PageServerLoad = async (event) => {
  const { supabase, session } = await getAdminServiceClient(event);
  await assertSuperAdmin(event, session);

  const { data, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (listError) {
    console.error('[admin players] failed to list users', listError);
    throw error(500, 'Unable to load players');
  }

  const users = (data?.users ?? []) as User[];
  const userIds = users.map((user) => user.id).filter(Boolean);

  const slotsQuery = supabase.from('player_companion_slots').select('user_id,max_slots');
  const licenseQuery = supabase.from('v_inventory_slot_license').select('user_id,qty');

  if (userIds.length) {
    slotsQuery.in('user_id', userIds);
    licenseQuery.in('user_id', userIds);
  }

  const [{ data: slots }, { data: licenses }] = await Promise.all([slotsQuery, licenseQuery]);

  const slotsByUser: NumberRecord = {};
  const licensesByUser: NumberRecord = {};

  (slots ?? []).forEach((row) => {
    if (row?.user_id) {
      slotsByUser[row.user_id] = Number(row.max_slots ?? 3);
    }
  });

  (licenses ?? []).forEach((row) => {
    if (row?.user_id) {
      licensesByUser[row.user_id] = Number(row.qty ?? 0);
    }
  });

  return { users, slotsByUser, licensesByUser };
};

export const actions: Actions = {
  grant: async (event) => {
    const { supabase, session } = await getAdminServiceClient(event);
    await assertSuperAdmin(event, session);

    const form = await event.request.formData();
    const userId = String(form.get('userId') ?? '').trim();
    const qtyValue = Number.parseInt(String(form.get('qty') ?? '1'), 10);
    const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;

    if (!userId) {
      return fail(400, { error: 'Missing userId' });
    }

    const { error: rpcError } = await supabase.rpc('admin_grant_slot_license', { p_user: userId, p_qty: qty });
    if (rpcError) {
      console.error('[admin players] grant RPC failed', rpcError);
      return fail(400, { error: rpcError.message ?? 'Unable to grant license' });
    }

    return { ok: true };
  }
};
