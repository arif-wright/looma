import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { getAdminFlags } from '$lib/server/admin-guard';

type MaintenanceState = { enabled: boolean; message: string | null; updated_at: string | null } | null;
const MAINTENANCE_FETCH_TIMEOUT_MS = 1500;
const ADMIN_FLAGS_TIMEOUT_MS = 1200;

let maintenanceCache: { state: MaintenanceState; expires: number } | null = null;

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const fetchMaintenance = async (): Promise<MaintenanceState> => {
  if (maintenanceCache && maintenanceCache.expires > Date.now()) {
    return maintenanceCache.state;
  }

  let state: MaintenanceState = { enabled: false, message: null, updated_at: null };
  try {
    const result = await withTimeout(
      supabaseAdmin.from('maintenance').select('enabled, message, updated_at').limit(1).maybeSingle(),
      MAINTENANCE_FETCH_TIMEOUT_MS,
      { data: null, error: { code: 'TIMEOUT' } } as any
    );
    const { data, error } = result;
    if (error) {
      if (error.code !== 'PGRST205' && error.code !== 'TIMEOUT') {
        console.error('[maintenance] fetch failed', error);
      }
    } else {
      state = data ?? state;
    }
  } catch (err) {
    console.error('[maintenance] fetch threw', err);
  }

  maintenanceCache = { state, expires: Date.now() + 30_000 };
  return state;
};

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const maintenance = await fetchMaintenance();
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await withTimeout(
    getAdminFlags(email, userId),
    ADMIN_FLAGS_TIMEOUT_MS,
    { isAdmin: false, isFinance: false, isSuper: false }
  );

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
