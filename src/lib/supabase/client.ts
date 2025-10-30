import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

let browserClient: SupabaseClient | null = null;

export const createSupabaseBrowserClient = () => {
  if (!browserClient) {
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Supabase browser client is not configured');
    }

    browserClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true }
    });
  }

  return browserClient;
};
