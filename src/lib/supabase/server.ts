import { createServerClient } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestEvent } from '@sveltejs/kit';

const resolveSupabaseConfig = () => {
  const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is not configured');
  }

  return { supabaseUrl, supabaseAnonKey };
};

export const createSupabaseServerClient = (event: RequestEvent) => {
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();
  const isSecure = event.url.protocol === 'https:';

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          if (value === undefined) {
            event.cookies.delete(name, {
              path: options?.path ?? '/',
              secure: options?.secure ?? isSecure,
              sameSite: options?.sameSite ?? 'lax',
              httpOnly: options?.httpOnly ?? true,
              expires: options?.expires,
              maxAge: options?.maxAge
            });
            return;
          }

          event.cookies.set(name, value, {
            path: options?.path ?? '/',
            secure: options?.secure ?? isSecure,
            sameSite: options?.sameSite ?? 'lax',
            httpOnly: options?.httpOnly ?? true,
            expires: options?.expires,
            maxAge: options?.maxAge
          });
        });
      }
    }
  });
};
