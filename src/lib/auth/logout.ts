import { createSupabaseBrowserClient } from '$lib/supabase/client';

export const logout = async () => {
  try {
    await fetch('/api/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'offline' }),
      keepalive: true
    });
  } catch {
    // no-op
  }

  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/app/auth';
};
