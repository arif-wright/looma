import type { Actions, PageServerLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { serviceClient } from '$lib/server/admin';
import { getAdminFlags } from '$lib/server/admin-guard';

const PAGE_SIZE = 25;

const requireAdmin = async (locals: App.Locals) => {
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);
  if (!flags.isAdmin) {
    throw redirect(302, '/app/admin');
  }
  return { flags, userId };
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const { flags } = await requireAdmin(locals);
  const admin = serviceClient();

  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const search = url.searchParams.get('q')?.trim() ?? '';
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin
    .from('profiles')
    .select('id, handle, display_name, email, avatar_url, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`handle.ilike.${term},display_name.ilike.${term},email.ilike.${term}`);
  }

  let { data: profiles, count, error: queryError } = await query;
  if (queryError && queryError.code === '42703' && String(queryError.message || '').includes('email')) {
    const fallbackQuery = admin
      .from('profiles')
      .select('id, handle, display_name, avatar_url, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to);
    if (search) {
      const term = `%${search}%`;
      const { data, count: fallbackCount, error } = await fallbackQuery.or(
        `handle.ilike.${term},display_name.ilike.${term}`
      );
      profiles = (data ?? []).map((row) => ({ ...row, email: null }));
      count = fallbackCount;
      queryError = error;
    } else {
      const { data, count: fallbackCount, error } = await fallbackQuery;
      profiles = (data ?? []).map((row) => ({ ...row, email: null }));
      count = fallbackCount;
      queryError = error;
    }
  }
  if (queryError) {
    console.error('[roles] failed to query profiles', queryError);
    throw error(500, 'Unable to load profiles');
  }

  const ids = (profiles ?? []).map((profile) => profile.id).filter(Boolean);
  let roleMap: Record<string, { is_admin: boolean; is_finance: boolean; is_super: boolean }> = {};
  if (ids.length) {
    const { data: roles, error: roleError } = await admin
      .from('admin_roles')
      .select('user_id, is_admin, is_finance, is_super')
      .in('user_id', ids);
    if (roleError) {
      console.error('[roles] failed to fetch admin roles', roleError);
    } else {
      roleMap = Object.fromEntries(
        (roles ?? []).map((row) => [row.user_id, { is_admin: !!row.is_admin, is_finance: !!row.is_finance, is_super: !!row.is_super }])
      );
    }
  }

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;

  return {
    canManageSuper: flags.isSuper,
    search,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    users: (profiles ?? []).map((profile) => ({
      ...profile,
      roles: roleMap[profile.id] ?? { is_admin: false, is_finance: false, is_super: false }
    }))
  };
};

const readIds = (form: FormData): string[] => {
  const ids = form.getAll('ids');
  return ids
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
};

const updateRole = async (
  userIds: string[],
  role: 'admin' | 'finance' | 'super',
  enable: boolean
) => {
  if (!userIds.length) return { error: null };
  const admin = serviceClient();
  const column = role === 'admin' ? 'is_admin' : role === 'finance' ? 'is_finance' : 'is_super';

  if (enable) {
    const payload = userIds.map((user_id) => ({ user_id, [column]: true }));
    return admin.from('admin_roles').upsert(payload, { onConflict: 'user_id' });
  }

  return admin
    .from('admin_roles')
    .update({ [column]: false })
    .in('user_id', userIds);
};

const handleRoleAction = async (
  locals: App.Locals,
  request: Request,
  enable: boolean
) => {
  const { flags } = await requireAdmin(locals);
  const form = await request.formData();
  const roleValue = String(form.get('role') ?? '').trim();
  if (!['admin', 'finance', 'super'].includes(roleValue)) {
    return fail(400, { message: 'Invalid role' });
  }
  if (roleValue === 'super' && !flags.isSuper) {
    return fail(403, { message: 'Only super admins can manage super admin role' });
  }

  const ids = readIds(form);
  if (!ids.length) {
    return fail(400, { message: 'Select at least one user' });
  }

  if (roleValue === 'super' && !enable) {
    // ensure we never remove the last super
    const admin = serviceClient();
    const { data: existing } = await admin.from('admin_roles').select('user_id').eq('is_super', true);
    if ((existing ?? []).length <= ids.length) {
      return fail(400, { message: 'At least one super admin is required' });
    }
  }

  const { error } = await updateRole(ids, roleValue as 'admin' | 'finance' | 'super', enable);
  if (error) {
    console.error('[roles] role mutation failed', error);
    return fail(500, { message: 'Unable to update roles' });
  }

  return { success: true };
};

export const actions: Actions = {
  assign: async ({ locals, request }) => handleRoleAction(locals, request, true),
  revoke: async ({ locals, request }) => handleRoleAction(locals, request, false)
};
