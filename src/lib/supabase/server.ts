import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestEvent } from '@sveltejs/kit';

const resolveSupabaseConfig = () => {
  const supabaseUrl = PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY;

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
      get: (name) => event.cookies.get(name),
      set: (name, value, options) => {
        event.cookies.set(name, value, {
          httpOnly: true,
          sameSite: 'lax',
          secure: isSecure,
          path: '/',
          ...options
        });
      },
      remove: (name, options) => {
        event.cookies.delete(name, {
          httpOnly: true,
          sameSite: 'lax',
          secure: isSecure,
          path: '/',
          ...options
        });
      }
    }
  });
};
