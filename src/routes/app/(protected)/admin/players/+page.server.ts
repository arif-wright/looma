import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { assertSuperAdmin, getAdminServiceClient } from '$lib/server/admin';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const SORT_OPTIONS = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  slots_desc: { column: 'max_slots', ascending: false },
  slots_asc: { column: 'max_slots', ascending: true },
  licenses_desc: { column: 'slot_license_count', ascending: false },
  licenses_asc: { column: 'slot_license_count', ascending: true }
} as const;

type PlayerRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  handle: string | null;
  created_at: string;
  max_slots: number | null;
  slot_license_count: number | null;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const load: PageServerLoad = async (event) => {
  const { supabase, session } = await getAdminServiceClient(event);
  await assertSuperAdmin(event, session);

  const searchParams = event.url.searchParams;
  const pageParam = Number(searchParams.get('page') ?? '1');
  const sizeParam = Number(searchParams.get('pageSize') ?? '25');
  const rawQuery = searchParams.get('q') ?? '';
  const sortParam = (searchParams.get('sort') ?? 'newest') as keyof typeof SORT_OPTIONS;

  const pageSize = clamp(Number.isFinite(sizeParam) ? sizeParam : 25, 10, 100);
  const page = Math.max(Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1, 1);
  const q = rawQuery.trim();
  const sortKey = SORT_OPTIONS[sortParam] ? sortParam : 'newest';
  const { column, ascending } = SORT_OPTIONS[sortKey];
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = supabase
    .from('admin_player_overview')
    .select('id,email,display_name,handle,created_at,max_slots,slot_license_count', { count: 'exact' })
    .range(rangeFrom, rangeTo)
    .order(column, { ascending, nullsLast: !ascending });

  if (q) {
    const escaped = q.replace(/[%_]/g, (char) => `\\${char}`);
    const like = `%${escaped}%`;
    const clauses = [`email.ilike.${like}`, `display_name.ilike.${like}`, `handle.ilike.${like}`];
    if (isUuid(q)) {
      clauses.push(`id.eq.${q}`);
    }
    query = query.or(clauses.join(','));
  }

  const { data, count, error: listError } = await query;
  if (listError) {
    console.error('[admin players] failed to list players', listError);
    throw error(500, 'Unable to load players');
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

  return {
    players: ((data ?? []) as PlayerRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      display_name: row.display_name ?? row.handle ?? '',
      handle: row.handle,
      max_slots: row.max_slots ?? 3,
      slot_license_count: row.slot_license_count ?? 0,
      created_at: row.created_at
    })),
    page,
    pageSize,
    total,
    totalPages,
    q,
    sort: sortKey
  };
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
