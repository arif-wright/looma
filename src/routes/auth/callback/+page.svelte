<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';

  const STORAGE_KEY = 'looma:auth:next';
  let status: 'checking' | 'error' = 'checking';
  let message = 'Signing you in…';

  const complete = async () => {
    const next = sessionStorage.getItem(STORAGE_KEY) ?? '/app/home';
    sessionStorage.removeItem(STORAGE_KEY);
    await goto(next || '/app/home', { replaceState: true });
  };

  const fail = (text: string) => {
    status = 'error';
    message = text;
    sessionStorage.removeItem(STORAGE_KEY);
  };

  onMount(async () => {
    const supabase = createSupabaseBrowserClient();

    try {
      const currentUrl = window.location.href;
      const parsed = new URL(currentUrl);
      const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);

      if (hashParams.has('access_token')) {
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        if (!access_token) {
          fail('Access token missing from callback.');
          return;
        }
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token ?? ''
        });
        if (error || !data?.session) {
          fail(error?.message ?? 'Unable to complete OAuth session.');
          return;
        }
        await complete();
        return;
      }

      if (parsed.searchParams.has('error')) {
        const reason =
          parsed.searchParams.get('error_description') ??
          parsed.searchParams.get('error') ??
          'We could not complete the sign-in process.';
        fail(reason);
        return;
      }

      if (parsed.searchParams.has('code')) {
        const authCode = parsed.searchParams.get('code');
        if (!authCode) {
          fail('We could not complete the sign-in process.');
          return;
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (error || !data.session) {
          fail(error?.message ?? 'We could not complete the sign-in process.');
          return;
        }

        await complete();
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        fail(error.message ?? 'We could not complete the sign-in process.');
        return;
      }

      if (data.session) {
        await complete();
        return;
      }

      fail('Session not found. Please try signing in again.');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Unexpected error while signing in.');
    }
  });
</script>

<section class="callback" aria-live="polite">
  <div class="card">
    <h1>Auth Callback</h1>
    {#if status === 'checking'}
      <p>{message}</p>
    {:else}
      <p class="error">{message}</p>
      <a href="/app/login" class="link">Back to login</a>
    {/if}
  </div>
</section>

<style>
  .callback {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at top, rgba(56, 189, 248, 0.15), transparent 55%),
      linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
    color: #e2e8f0;
    padding: 24px;
  }

  .card {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 16px;
    padding: 32px;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 30px 60px rgba(15, 23, 42, 0.4);
    text-align: center;
  }

  h1 {
    margin-bottom: 12px;
    font-size: 1.35rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
  }

  .error {
    color: #fca5a5;
    margin-bottom: 16px;
  }

  .link {
    color: #38bdf8;
    text-decoration: underline;
  }

  .link:hover,
  .link:focus-visible {
    text-decoration: none;
  }
</style>
