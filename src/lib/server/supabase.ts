import { createClient, type Session } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createSupabaseServerClient as createSupabaseSsrClient } from '$lib/supabase/server';

const SUPABASE_URL = publicEnv.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase admin client is not configured');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
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
