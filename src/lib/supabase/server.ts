import { createServerClient } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestEvent } from '@sveltejs/kit';

const resolveSupabaseConfig = () => {
  const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
};

const SUPABASE_UNCONFIGURED_ERROR = 'Supabase URL or anon key is not configured';

// We want the app (and basic Playwright smoke tests) to still run without Supabase
// wired. Calls that actually need Supabase will throw at the point of use.
const unconfiguredSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(SUPABASE_UNCONFIGURED_ERROR);
    }
  }
);

export const createSupabaseServerClient = (event: RequestEvent) => {
  const config = resolveSupabaseConfig();
  if (!config) {
    return unconfiguredSupabase as any;
  }
  const { supabaseUrl, supabaseAnonKey } = config;
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
