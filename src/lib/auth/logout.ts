import { createSupabaseBrowserClient } from '$lib/supabase/client';

export const logout = async () => {
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/app/auth';
};
