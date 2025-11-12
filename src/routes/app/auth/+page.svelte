<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { createClient, type SupabaseClient } from '@supabase/supabase-js';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

  const providers = ['google', 'github'] as const;

  let email = '';
  let submitting = false;
  let message = '';
  let supabase: SupabaseClient | null = null;
  let ready = false;
  let envError = '';

  const getRedirectTarget = () =>
    typeof window === 'undefined' ? undefined : `${window.location.origin}/auth/callback`;

  onMount(() => {
    if (!browser) return;
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
      envError = 'Supabase credentials are not configured.';
      message = envError;
      return;
    }

    supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true }
    });
    ready = true;
  });

  async function signInWithProvider(provider: (typeof providers)[number]) {
    if (!supabase) {
      message = envError || 'Supabase client not ready.';
      return;
    }
    submitting = true;
    message = '';
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: (() => {
          const target = getRedirectTarget();
          return target ? { redirectTo: target } : undefined;
        })(),
        flowType: 'pkce'
      });
      if (error) throw error;
      message = 'Redirecting to provider…';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Unable to start sign in';
    } finally {
      submitting = false;
    }
  }

  async function sendMagicLink(event: SubmitEvent) {
    event.preventDefault();
    if (!supabase) {
      message = envError || 'Supabase client not ready.';
      return;
    }
    if (!email) {
      message = 'Enter your email to continue.';
      return;
    }
    submitting = true;
    message = '';
    try {
      const target = getRedirectTarget();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: target ? { emailRedirectTo: target } : undefined
      });
      if (error) throw error;
      message = 'Check your email for a magic link.';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Unable to send magic link';
    } finally {
      submitting = false;
    }
  }
</script>

<div class="auth-shell">
  <section class="auth-panel">
    <h1>Welcome back</h1>
    <p class="subtitle">Choose a provider or request a magic link to continue.</p>

    <div class="providers">
      {#each providers as provider}
        <button
          class="provider-btn"
          type="button"
          on:click={() => signInWithProvider(provider)}
          disabled={submitting || !ready}
        >
          Sign in with {provider.charAt(0).toUpperCase() + provider.slice(1)}
        </button>
      {/each}
    </div>

    <form class="magic-link" on:submit|preventDefault={sendMagicLink}>
      <label for="email">Email</label>
      <input
        id="email"
        type="email"
        placeholder="you@example.com"
        bind:value={email}
        required
      />
      <button type="submit" class="provider-btn" disabled={submitting || !ready}>
        {submitting ? 'Sending…' : 'Send magic link'}
      </button>
    </form>

    {#if message}
      <p class="status" aria-live="polite">{message}</p>
    {/if}
  </section>
</div>

<style>
  .auth-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: radial-gradient(circle at top, rgba(58, 215, 255, 0.12), transparent 50%),
      radial-gradient(circle at bottom, rgba(255, 79, 184, 0.12), transparent 45%),
      #05060b;
  }

  .auth-panel {
    width: min(420px, 100%);
    background: rgba(12, 16, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.5rem;
    padding: 2.5rem;
    color: white;
    box-shadow: 0 25px 50px rgba(5, 6, 11, 0.6);
  }

  h1 {
    font-size: 1.85rem;
    margin: 0;
  }

  .subtitle {
    margin-top: 0.3rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .providers {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .provider-btn {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 0.8rem 1.4rem;
    background: rgba(255, 255, 255, 0.08);
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms ease, transform 140ms ease;
  }

  .provider-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .provider-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .magic-link {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 2rem;
  }

  .magic-link input {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    padding: 0.75rem 1rem;
    color: white;
    outline: none;
  }

  .magic-link input:focus {
    border-color: rgba(58, 215, 255, 0.8);
  }

  .status {
    margin-top: 1rem;
    font-size: 0.92rem;
    color: rgba(255, 255, 255, 0.8);
  }
</style>
