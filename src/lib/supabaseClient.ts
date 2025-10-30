import type { RequestEvent } from '@sveltejs/kit';
import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { createSupabaseServerClient } from '$lib/supabase/server';

export const supabaseBrowser = () => createSupabaseBrowserClient();

export const supabaseServer = (event: RequestEvent) => createSupabaseServerClient(event);

// Dev helper: expose Supabase browser client globally for quick console access.
if (typeof window !== 'undefined') {
  const globalWin = window as any;
  if (!globalWin.supabase) {
    globalWin.supabase = supabaseBrowser();
  }
}
