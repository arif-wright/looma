import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { serviceClient } from '$lib/server/admin';
import { getAdminFlags } from '$lib/server/admin-guard';

const hasAdminAccess = async (locals: App.Locals) => {
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);
  return flags.isAdmin;
};

export const load: PageServerLoad = async ({ locals }) => {
  if (!(await hasAdminAccess(locals))) {
    throw redirect(302, '/app/home');
  }

  const admin = serviceClient();
  const { data, error } = await admin
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin/reports] load failed', error);
    return { reports: [] };
  }

  return { reports: data ?? [] };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    if (!(await hasAdminAccess(locals))) {
      return { error: 'unauthorized' };
    }

    const form = await request.formData();
    const idValue = form.get('id');
    const statusValue = form.get('status');
    const id = typeof idValue === 'string' ? Number(idValue) : Number(idValue ?? NaN);
    const status = typeof statusValue === 'string' ? statusValue.trim() : '';

    if (!Number.isFinite(id) || !status) {
      return { error: 'bad_request' };
    }

    const reviewerId = locals.user?.id ?? null;
    const admin = serviceClient();
    const { error } = await admin
      .from('reports')
      .update({ status, reviewer_id: reviewerId })
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    return { ok: true };
  }
};
