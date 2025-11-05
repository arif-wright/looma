import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

const parseAdminList = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const admins = parseAdminList(env.ADMIN_EMAILS);
  return admins.includes(email.toLowerCase());
}

export function serviceClient() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE;

  if (!PUBLIC_SUPABASE_URL || !key) {
    throw new Error('Supabase service credentials are not configured');
  }

  return createClient(PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false }
  });
}
