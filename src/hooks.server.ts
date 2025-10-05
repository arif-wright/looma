// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  const supabase = createSupabaseServerClient({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event
  });

  event.locals.supabase = supabase;
  event.locals.getSession = async () => (await supabase.auth.getSession()).data.session ?? null;
  event.locals.getUser = async () => (await supabase.auth.getUser()).data.user ?? null;

  return resolve(event);
};

declare global {
  namespace App {
    interface Locals {
      supabase: ReturnType<typeof createSupabaseServerClient>;
      getSession: () => Promise<
        | (Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>['auth']['getSession']>>)['data']['session']
        | null
      >;
      getUser: () => Promise<
        | (Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>['auth']['getUser']>>)['data']['user']
        | null
      >;
    }
  }
}

export {};





