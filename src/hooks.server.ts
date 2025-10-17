import type { Handle } from '@sveltejs/kit';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '$lib/supabaseClient';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.hostname === '127.0.0.1') {
    const url = new URL(event.request.url);
    url.hostname = 'localhost';
    return new Response(null, { status: 301, headers: { Location: url.toString() } });
  }

  const supabase = supabaseServer(event);
  const { data } = await supabase.auth.getSession();

  event.locals.supabase = supabase;
  event.locals.session = data.session ?? null;

  return resolve(event);
};

declare module '@sveltejs/kit' {
  interface Locals {
    supabase: SupabaseClient;
    session: Session | null;
  }
}
