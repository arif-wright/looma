import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

const parseLegacyAdmins = () =>
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);

export async function getAdminFlags(email?: string | null, userId?: string | null) {
  const basic = { isAdmin: false, isFinance: false };
  const list = parseLegacyAdmins();
  if (email && list.includes(email)) basic.isAdmin = true;
  if (!userId) return basic;

  const service = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const { data } = await service
    .from('admin_roles')
    .select('is_admin,is_finance')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    isAdmin: basic.isAdmin || !!data?.is_admin,
    isFinance: !!data?.is_finance
  };
}
