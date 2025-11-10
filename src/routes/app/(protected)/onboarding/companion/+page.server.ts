import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const adminClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session) {
    throw redirect(302, '/login');
  }

  const { data: flag, error } = await adminClient
    .from('feature_flags')
    .select('key, enabled')
    .eq('key', 'bond_genesis')
    .maybeSingle();

  if (error) {
    console.error('[bond-genesis] failed to fetch flag', error);
  }

  if (!flag?.enabled) {
    throw redirect(302, '/app/home');
  }

  return {};
};
