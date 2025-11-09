import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isAdminEmail, serviceClient } from '$lib/server/admin';

const adminEmail = (locals: App.Locals) => (locals.user?.email ?? null);

export const load: PageServerLoad = async ({ locals }) => {
  if (!isAdminEmail(adminEmail(locals))) {
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
    if (!isAdminEmail(adminEmail(locals))) {
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
