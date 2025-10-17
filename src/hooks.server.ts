import type { Handle } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
  const SUPABASE_URL = privateEnv.SUPABASE_URL ?? publicEnv.PUBLIC_SUPABASE_URL ?? '';
  const SUPABASE_ANON = privateEnv.SUPABASE_ANON_KEY ?? publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? '';

  let supabase: SupabaseClient | null = null;

  if (SUPABASE_URL && SUPABASE_ANON) {
    supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
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
  } else if (import.meta.env.DEV) {
    console.warn('Supabase environment variables missing; skipping server client initialisation.');
  }

  event.locals.supabase = supabase;
  event.locals.getSession = async () => {
    if (!supabase) return null;
    return (await supabase.auth.getSession()).data.session ?? null;
  };
  event.locals.getUser = async () => {
    if (!supabase) return null;
    return (await supabase.auth.getUser()).data.user ?? null;
  };

  return resolve(event);
};

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient | null;
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
