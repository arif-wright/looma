import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SITE_URL } from '$env/static/public';

export const supabaseBrowser = () =>
  createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export const supabaseServer = (event: { cookies: any; fetch: typeof fetch }) =>
  createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get: (k: string) => event.cookies.get(k),
      set: (k: string, v: string, o: any) => event.cookies.set(k, v, o),
      remove: (k: string, o: any) => event.cookies.delete(k, o),
    },
    fetch: event.fetch,
  });

export const magicLinkRedirect = `${PUBLIC_SITE_URL}/auth/callback`;
