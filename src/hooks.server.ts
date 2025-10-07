import type { Handle } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get: (name) => event.cookies.get(name),
      set: (name, value, options) => {
        event.cookies.set(name, value, { path: '/', ...options });
      },
      remove: (name, options) => {
        event.cookies.delete(name, { path: '/', ...options });
      }
    }
  });

  event.locals.supabase = supabase;
  event.locals.getSession = async () => (await supabase.auth.getSession()).data.session ?? null;
  event.locals.getUser = async () => (await supabase.auth.getUser()).data.user ?? null;

  return resolve(event);
};

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      getSession: () => Promise<
        | (Awaited<ReturnType<SupabaseClient['auth']['getSession']>>)['data']['session']
        | null
      >;
      getUser: () => Promise<
        | (Awaited<ReturnType<SupabaseClient['auth']['getUser']>>)['data']['user']
        | null
      >;
    }
  }
}

export {};





