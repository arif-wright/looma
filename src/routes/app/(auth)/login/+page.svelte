<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { z } from 'zod';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
  import { PUBLIC_OAUTH_GOOGLE, PUBLIC_AUTH_CALLBACK } from '$env/static/public';

  export let data: { next?: string | null };

  const ACCENT_GRADIENT = 'linear-gradient(90deg, #9b5cff, #4df4ff)';
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
      sessionStorage.setItem('looma:auth:next', resolveNext());
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

    const { error } = await supabase.auth.signInWithPassword(result.data);

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
    oauthLoading = 'google';

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

<article class="auth-card" style={`--accent-gradient: ${ACCENT_GRADIENT};`}>
  <header class="auth-card__header">
    <h1>Looma remembers your light.</h1>
    <p>Step back into your bond.</p>
  </header>

  <form class="auth-form" data-testid="login-form" on:submit={handleEmailLogin} aria-label="Email login">
    <label class="auth-field">
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

    <label class="auth-field">
      <span>Password</span>
      <input
        type="password"
        name="password"
        autocomplete="current-password"
        bind:value={password}
        required
        minlength="8"
        placeholder="Enter your password"
      />
    </label>

    {#if errorMessage}
      <p class="auth-error" role="alert">{errorMessage}</p>
    {/if}

    <button class="auth-primary" type="submit" data-testid="email-login" disabled={loading}>
      <span>{loading ? 'Signing in…' : 'Continue with email'}</span>
    </button>
  </form>

  <div class="auth-divider" role="presentation">
    <span>or continue with</span>
  </div>

  <div class="auth-oauth" hidden={!oauthFlags.google}>
    <button
      type="button"
      class="auth-oauth__button"
      aria-label="Continue with Google"
      data-testid="oauth-google"
      on:click={handleOAuth}
      disabled={oauthLoading !== null}
    >
      {oauthLoading === 'google' ? 'Opening Google…' : 'Continue with Google'}
    </button>
  </div>

  <p class="auth-footnote">
    Need an account?
    <a href="/app/signup" class="auth-link">Create one</a>
  </p>
</article>

<style>
  .auth-card {
    width: min(520px, 100%);
    background:
      linear-gradient(150deg, rgba(16, 20, 32, 0.44), rgba(5, 8, 18, 0.26));
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 22px;
    padding: clamp(2.3rem, 3vw, 3rem);
    backdrop-filter: blur(26px);
    box-shadow:
      0 26px 60px rgba(6, 7, 12, 0.48),
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    animation: fadeUp 620ms cubic-bezier(0.26, 0.78, 0.33, 0.99) both;
    color: #f9f8ff;
  }

  .auth-card__header {
    display: grid;
    gap: 0.65rem;
    margin-bottom: 2.25rem;
  }

  .auth-card__header h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.4rem);
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .auth-card__header p {
    margin: 0;
    font-size: 1rem;
    color: rgba(211, 202, 255, 0.8);
  }

  .auth-form {
    display: grid;
    gap: 1.25rem;
  }

  .auth-field {
    display: grid;
    gap: 0.45rem;
  }

  .auth-field span {
    font-size: 0.9rem;
    font-weight: 500;
    color: rgba(238, 235, 255, 0.78);
  }

  input {
    width: 100%;
    padding: 0.9rem 1rem;
    border-radius: 14px;
    background: rgba(17, 19, 28, 0.55);
    border: 1px solid rgba(157, 152, 255, 0.2);
    color: inherit;
    font-size: 1rem;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background 220ms ease;
  }

  input::placeholder {
    color: rgba(204, 200, 236, 0.5);
  }

  input:focus-visible {
    outline: none;
    border-color: rgba(157, 92, 255, 0.75);
    box-shadow:
      0 0 0 2px rgba(157, 92, 255, 0.3),
      0 15px 30px rgba(157, 92, 255, 0.18);
    background: rgba(18, 20, 33, 0.75);
  }

  .auth-error {
    margin: -0.4rem 0 0;
    color: #ff9bb5;
    font-size: 0.9rem;
  }

  .auth-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.25rem;
    padding: 0.95rem 1.2rem;
    width: 100%;
    border-radius: 14px;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    color: #05060d;
    background: var(--accent-gradient);
    cursor: pointer;
    transition:
      transform 200ms ease,
      box-shadow 220ms ease;
  }

  .auth-primary:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .auth-primary:not(:disabled):hover,
  .auth-primary:not(:disabled):focus-visible {
    transform: translateY(-2px);
    box-shadow:
      0 18px 40px rgba(77, 244, 255, 0.28),
      0 8px 20px rgba(155, 92, 255, 0.33);
  }

  .auth-primary:not(:disabled):active {
    animation: pulse 620ms ease;
  }

  .auth-divider {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 2.5rem 0 1.75rem;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.32em;
    color: rgba(218, 215, 255, 0.4);
  }

  .auth-divider::before,
  .auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(217, 217, 255, 0.12), transparent);
  }

  .auth-divider::after {
    background: linear-gradient(90deg, transparent, rgba(217, 217, 255, 0.12));
  }

  .auth-oauth {
    display: grid;
    gap: 0.75rem;
  }

  .auth-oauth__button {
    width: 100%;
    padding: 0.85rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(210, 208, 255, 0.14);
    background: rgba(18, 20, 34, 0.55);
    color: #f5f3ff;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 180ms ease,
      background 200ms ease,
      box-shadow 220ms ease;
  }

  .auth-oauth__button:not(:disabled):hover,
  .auth-oauth__button:not(:disabled):focus-visible {
    background: rgba(27, 30, 46, 0.78);
    border-color: rgba(157, 92, 255, 0.45);
    box-shadow: 0 12px 30px rgba(155, 92, 255, 0.25);
  }

  .auth-oauth__button:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .auth-footnote {
    margin: 2.25rem 0 0;
    font-size: 0.95rem;
    color: rgba(222, 219, 255, 0.7);
  }

  .auth-link {
    color: #c3bbff;
    font-weight: 500;
  }

  .auth-link:hover,
  .auth-link:focus-visible {
    text-decoration: underline;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(22px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(0.99);
      box-shadow: 0 0 0 0 rgba(157, 92, 255, 0.4);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 16px rgba(157, 92, 255, 0);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(157, 92, 255, 0);
    }
  }

  @media (max-width: 640px) {
    .auth-card {
      padding: 2rem 1.5rem;
      border-radius: 20px;
    }
  }
</style>
