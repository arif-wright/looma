<script lang="ts">
  import { supabaseBrowser } from '$lib/supabaseClient';
  import { PUBLIC_APP_URL } from '$env/static/public';
  import { sanitizeInternalPath } from '$lib/auth/consumeHashSession';

  let email = '';
  let ok: boolean | null = null;
  let error: string | null = null;

  function resolveCallbackUrl(): string {
    const origin = (PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : ''))
      .replace(/\/$/, '');
    if (typeof window === 'undefined') {
      return origin + '/auth/callback?next=' + encodeURIComponent('/app');
    }
    const params = new URLSearchParams(window.location.search);
    const next = sanitizeInternalPath(params.get('next') ?? params.get('redirectTo')) ?? '/app';
    return origin + '/auth/callback?next=' + encodeURIComponent(next);
  }

  async function sendMagic(e: Event) {
    e.preventDefault();
    ok = null;
    error = null;

    const emailRedirectTo = resolveCallbackUrl();

    const supabase = supabaseBrowser();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo }
    });

    if (err) {
      error = err.message;
      ok = false;
    } else {
      ok = true;
    }
  }
</script>

<h1>Login</h1>

<form class="flex flex-col gap-3 max-w-sm" on:submit={sendMagic}>
  <input
    type="email"
    placeholder="you@example.com"
    bind:value={email}
    required
    class="border rounded p-2"
  />
  <button class="bg-emerald-600 text-white py-2 px-4 rounded">Send Magic Link</button>
</form>

{#if error}
  <p style="color:red;margin-top:10px;">{error}</p>
{:else if ok}
  <p style="color:green;margin-top:10px;">If that email exists, a sign-in link was sent.</p>
{/if}
