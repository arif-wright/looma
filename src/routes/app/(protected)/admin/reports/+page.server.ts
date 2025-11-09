import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS } from '$env/static/private';

const adminClient = () =>
  createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

const normalizeAllowList = () =>
  (ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function assertAdmin(email?: string | null) {
  if (!email) return false;
  const allow = normalizeAllowList();
  return allow.includes(email.toLowerCase());
}

export const load: PageServerLoad = async ({ locals }) => {
  const email = locals.user?.email ?? locals.session?.user?.email ?? null;
  if (!assertAdmin(email)) {
    throw redirect(302, '/app/home');
  }

  const admin = adminClient();
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
    const email = locals.user?.email ?? locals.session?.user?.email ?? null;
    if (!assertAdmin(email)) {
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

    const reviewerId = locals.user?.id ?? locals.session?.user?.id ?? null;
    const admin = adminClient();
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
