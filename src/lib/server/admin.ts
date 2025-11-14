import { createClient, type Session } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/server/supabase';

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

export function getServiceKey(): string {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '';
  if (!key) {
    throw new Error('Supabase service credentials are not configured');
  }
  return key;
}

export function serviceClient() {
  return createClient(PUBLIC_SUPABASE_URL, getServiceKey(), {
    auth: { persistSession: false }
  });
}

export async function getAdminServiceClient(event: RequestEvent) {
  const { session } = await createSupabaseServerClient(event);
  return { supabase: serviceClient(), session };
}

export async function assertSuperAdmin(event: RequestEvent, session: Session | null) {
  if (!session?.user) {
    throw redirect(302, '/app/auth');
  }

  const email = session.user.email?.toLowerCase() ?? null;
  if (email && isAdminEmail(email)) {
    return session.user;
  }

  try {
    const admin = serviceClient();
    const { data, error } = await admin
      .from('admin_roles')
      .select('is_super')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) {
      console.error('[admin] failed to verify super role', error);
    }

    if (!data?.is_super) {
      throw redirect(302, '/app/home');
    }
  } catch (err) {
    console.error('[admin] unable to resolve super admin access', err);
    throw redirect(302, '/app/home');
  }

  return session.user;
}
