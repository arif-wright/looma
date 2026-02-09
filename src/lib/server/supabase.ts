import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createSupabaseServerClient as createSupabaseSsrClient } from '$lib/supabase/server';

const createAdminClient = (): SupabaseClient => {
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? privateEnv.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('Supabase admin client is not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
};

let cachedAdminClient: SupabaseClient | null = null;
const getAdminClient = () => (cachedAdminClient ??= createAdminClient());

// Proxy prevents build-time static analysis from crashing when env isn't injected.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getAdminClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

type SupabaseServerResult = { supabase: App.Locals['supabase']; session: Session | null };

export const createSupabaseServerClient = async (event: RequestEvent): Promise<SupabaseServerResult> => {
  const supabase = event.locals.supabase ?? createSupabaseSsrClient(event);
  if (!event.locals.supabase) {
    event.locals.supabase = supabase;
  }

  if (typeof event.locals.session !== 'undefined') {
    return { supabase, session: event.locals.session };
  }

  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[supabase] failed to fetch session', error);
    event.locals.session = null;
    return { supabase, session: null as Session | null };
  }

  event.locals.session = session ?? null;
  if (!event.locals.user && session?.user) {
    event.locals.user = session.user;
  }

  return { supabase, session: session ?? null };
};
