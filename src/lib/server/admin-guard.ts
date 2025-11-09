import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

export type AdminFlags = { isAdmin: boolean; isFinance: boolean; isSuper: boolean };

const legacyAdmins = () =>
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);

export async function getAdminFlags(email?: string | null, userId?: string | null): Promise<AdminFlags> {
  const base: AdminFlags = { isAdmin: false, isFinance: false, isSuper: false };
  const allowlist = legacyAdmins();

  if (email && allowlist.includes(email)) {
    base.isAdmin = true;
  }

  if (!userId) {
    return base;
  }

  const service = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const { data } = await service
    .from('admin_roles')
    .select('is_admin,is_finance,is_super')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    isAdmin: base.isAdmin || !!data?.is_admin || !!data?.is_super,
    isFinance: !!data?.is_finance || !!data?.is_super,
    isSuper: !!data?.is_super
  };
}
