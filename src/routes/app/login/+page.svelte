<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { z } from 'zod';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
  import { PUBLIC_OAUTH_GOOGLE, PUBLIC_AUTH_CALLBACK } from '$env/static/public';

  export let data: { next?: string | null };

  const supabase = createSupabaseBrowserClient();
  const schema = z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long')
  });

  const AUTH_CALLBACK = PUBLIC_AUTH_CALLBACK || '/auth/callback';
  const oauthFlags = {
    google: PUBLIC_OAUTH_GOOGLE === 'true'
  };

  let email = '';
  let password = '';
  let errorMessage: string | null = null;
  let loading = false;
  let oauthLoading: 'google' | null = null;

  const resolveNext = () => data?.next ?? '/app/home';

  const setNext = () => {
    try {
      const target = resolveNext();
      sessionStorage.setItem('looma:auth:next', target);
    } catch (err) {
      console.warn('Failed to persist next redirect', err);
    }
  };

  const clearNext = () => {
    try {
      sessionStorage.removeItem('looma:auth:next');
    } catch (err) {
      console.warn('Failed to clear next redirect', err);
    }
  };

  const handleEmailLogin = async (event: SubmitEvent) => {
    event.preventDefault();
    errorMessage = null;

    const result = schema.safeParse({ email, password });
    if (!result.success) {
      errorMessage = result.error.issues[0]?.message ?? 'Check your input and try again.';
      return;
    }

    loading = true;

    const { error } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password: result.data.password
    });

    loading = false;

    if (error) {
      errorMessage = error.message || 'Unable to sign in. Please try again.';
      return;
    }

    setNext();
    await goto(resolveNext(), { replaceState: true });
  };

  const handleOAuth = async () => {
    errorMessage = null;
    oauthLoading = provider;

    setNext();

    const origin = get(page).url.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}${AUTH_CALLBACK}`,
        scopes: 'email profile'
      }
    });

    if (error) {
      clearNext();
      errorMessage = error.message || 'Unable to sign in with Google.';
      oauthLoading = null;
    }
  };
</script>

<section class="auth-shell">
  <div class="panel">
    <h1>Welcome back</h1>
    <p class="subtitle">Sign in to continue building with Looma.</p>

    <form class="form" on:submit={handleEmailLogin} aria-label="Email login">
      <label class="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autocomplete="email"
          bind:value={email}
          required
          placeholder="you@example.com"
        />
      </label>

      <label class="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          bind:value={password}
          required
          minlength="8"
        />
      </label>

      {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}

      <button
        class="primary"
        type="submit"
        data-testid="email-login"
        disabled={loading}
      >
        {#if loading}
          Signing in…
        {:else}
          Continue with email
        {/if}
      </button>
    </form>

    <div class="divider" role="presentation">
      <span>or</span>
    </div>

    <div class="oauth-group" hidden={!oauthFlags.google}>
      <button
        type="button"
        class="oauth"
        aria-label="Continue with Google"
        data-testid="oauth-google"
        on:click={handleOAuth}
        disabled={oauthLoading !== null}
      >
        {oauthLoading === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </button>
    </div>

    <p class="footnote">
      Need an account?
      <a href="/app/signup" class="link">Create one</a>
    </p>
  </div>
</section>

<style>
  .auth-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px 16px;
    background: radial-gradient(circle at top right, rgba(45, 212, 191, 0.18), transparent 55%),
      radial-gradient(circle at bottom left, rgba(56, 189, 248, 0.22), transparent 50%),
      #0f172a;
    color: #e2e8f0;
  }

  .panel {
    width: min(480px, 100%);
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 20px;
    padding: 40px;
    box-shadow: 0 30px 60px rgba(15, 23, 42, 0.4);
  }

  h1 {
    font-size: 1.9rem;
    font-weight: 600;
    margin: 0 0 12px;
  }

  .subtitle {
    margin: 0 0 32px;
    color: rgba(148, 163, 184, 0.78);
  }

  .form {
    display: grid;
    gap: 18px;
  }

  .field {
    display: grid;
    gap: 8px;
    font-size: 0.9rem;
  }

  .field span {
    color: rgba(148, 163, 184, 0.9);
    font-weight: 500;
  }

  input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.4);
    color: inherit;
    font-size: 1rem;
  }

  input:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.55);
    outline-offset: 2px;
  }

  .primary {
    margin-top: 4px;
    padding: 12px 18px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.85), rgba(45, 212, 191, 0.85));
    color: #0f172a;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .primary:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .primary:hover:not(:disabled),
  .primary:focus-visible:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 18px 36px rgba(56, 189, 248, 0.35);
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 28px 0;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    color: rgba(148, 163, 184, 0.55);
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(148, 163, 184, 0.18);
  }

  .oauth-group {
    display: grid;
    gap: 12px;
  }

  .oauth {
    width: 100%;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .oauth:hover:not(:disabled),
  .oauth:focus-visible:not(:disabled) {
    background: rgba(56, 189, 248, 0.22);
    border-color: rgba(56, 189, 248, 0.45);
  }

  .oauth:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .error {
    margin: 0;
    color: #fca5a5;
    font-size: 0.9rem;
  }

  .footnote {
    margin-top: 32px;
    color: rgba(148, 163, 184, 0.78);
    font-size: 0.9rem;
  }

  .link {
    color: #38bdf8;
  }

  .link:hover,
  .link:focus-visible {
    text-decoration: underline;
  }

  @media (max-width: 560px) {
    .panel {
      padding: 28px 24px;
    }
  }
</style>
