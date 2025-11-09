import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { getAdminFlags } from '$lib/server/admin-guard';

type MaintenanceState = { enabled: boolean; message: string | null; updated_at: string | null } | null;

let maintenanceCache: { state: MaintenanceState; expires: number } | null = null;

const fetchMaintenance = async (): Promise<MaintenanceState> => {
  if (maintenanceCache && maintenanceCache.expires > Date.now()) {
    return maintenanceCache.state;
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance')
    .select('enabled, message, updated_at')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[maintenance] fetch failed', error);
  }

  const state = data ?? { enabled: false, message: null, updated_at: null };
  maintenanceCache = { state, expires: Date.now() + 30_000 };
  return state;
};

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const maintenance = await fetchMaintenance();
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);

  if (maintenance?.enabled && !flags.isAdmin && !url.pathname.startsWith('/maintenance')) {
    throw redirect(302, '/maintenance');
  }

  const user = locals.user;
  let profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null =
    null;

  if (user && locals.supabase) {
    const { data } = await locals.supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    profile = (data as typeof profile) ?? null;
  }

  return { user, profile, maintenance };
};
