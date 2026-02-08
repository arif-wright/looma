import { createBrowserClient } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createSupabaseBrowserClient = () => {
  if (!browserClient) {
    const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase browser client is not configured');
    }

    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
  }

  return browserClient;
};
