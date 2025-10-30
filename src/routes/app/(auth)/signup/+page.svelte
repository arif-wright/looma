<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { z } from 'zod';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { PUBLIC_OAUTH_GOOGLE, PUBLIC_AUTH_CALLBACK, PUBLIC_SITE_URL } from '$env/static/public';

  export let data: { next?: string | null };

  const ACCENT_GRADIENT = 'linear-gradient(90deg, #9b5cff, #4df4ff)';
  const supabase = createSupabaseBrowserClient();
  const schema = z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long')
  });

  const oauthFlags = {
    google: PUBLIC_OAUTH_GOOGLE === 'true'
  };

  let email = '';
  let password = '';
  let loading = false;
  let oauthLoading: 'google' | null = null;
  let errorMessage: string | null = null;
  let successMessage: string | null = null;

  const resolveNext = () => data?.next ?? '/app/home';

  const persistNext = () => {
    try {
      sessionStorage.setItem('looma:auth:next', resolveNext());
    } catch (err) {
      console.warn('Failed to persist redirect', err);
    }
  };

  const clearNext = () => {
    try {
      sessionStorage.removeItem('looma:auth:next');
    } catch (err) {
      console.warn('Failed to clear redirect', err);
    }
  };

  const handleSignup = async (event: SubmitEvent) => {
    event.preventDefault();
    errorMessage = null;
    successMessage = null;

    const result = schema.safeParse({ email, password });
    if (!result.success) {
      errorMessage = result.error.issues[0]?.message ?? 'Check your input and try again.';
      return;
    }

    loading = true;

    const { data: signUpData, error } = await supabase.auth.signUp(result.data);

    loading = false;

    if (error) {
      errorMessage = error.message || 'Unable to create your account.';
      return;
    }

    if (signUpData.session) {
      persistNext();
      await goto(resolveNext(), { replaceState: true });
      return;
    }

    successMessage = 'Check your email to confirm your account.';
  };

  const handleOAuth = async () => {
    errorMessage = null;
    successMessage = null;
    oauthLoading = 'google';

    persistNext();

    const configuredBase = PUBLIC_SITE_URL?.replace(/\/$/, '') || null;
    const redirectUrl = normalizedCallback.startsWith('http') ? normalizedCallback : `${baseUrl}${normalizedCallback}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: 'email profile'
      }
    });

    if (error) {
      clearNext();
      errorMessage = error.message || 'Unable to continue with Google.';
      oauthLoading = null;
    }
  };
</script>

<article class="auth-card" style={`--accent-gradient: ${ACCENT_GRADIENT};`}>
  <header class="auth-card__header">
    <h1>Looma remembers your light.</h1>
    <p>Step back into your bond.</p>
  </header>

  <form class="auth-form" on:submit={handleSignup} aria-label="Email signup">
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
        autocomplete="new-password"
        bind:value={password}
        required
        minlength="8"
        placeholder="Create a strong password"
      />
    </label>

    {#if errorMessage}
      <p class="auth-error" role="alert">{errorMessage}</p>
    {/if}

    {#if successMessage}
      <p class="auth-success" role="status">{successMessage}</p>
    {/if}

    <button class="auth-primary" type="submit" data-testid="email-signup" disabled={loading}>
      <span>{loading ? 'Creating account…' : 'Create account'}</span>
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
    Already have an account?
    <a href="/app/login" class="auth-link">Sign in</a>
  </p>
</article>

<style>
  .auth-card {
    width: min(520px, 100%);
    background:
      linear-gradient(155deg, rgba(24, 30, 47, 0.18), rgba(8, 12, 26, 0.06));
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 22px;
    padding: clamp(2.3rem, 3vw, 3rem);
    backdrop-filter: blur(38px) saturate(165%);
    box-shadow:
      0 28px 70px rgba(3, 4, 12, 0.46),
      inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    animation: fadeUp 620ms cubic-bezier(0.26, 0.78, 0.33, 0.99) both;
    color: #f9f8ff;
    position: relative;
    overflow: hidden;
  }

  .auth-card::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    background:
      linear-gradient(115deg, rgba(255, 255, 255, 0.35), transparent 55%),
      radial-gradient(circle at 22% 20%, rgba(255, 255, 255, 0.2), transparent 55%),
      radial-gradient(circle at 82% 80%, rgba(255, 255, 255, 0.16), transparent 58%);
    opacity: 0.4;
    pointer-events: none;
    mix-blend-mode: screen;
  }

  .auth-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 65%);
    mix-blend-mode: lighten;
    pointer-events: none;
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
    background: rgba(17, 19, 28, 0.28);
    border: 1px solid rgba(157, 152, 255, 0.22);
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
    background: rgba(18, 20, 33, 0.42);
  }

  .auth-error {
    margin: -0.4rem 0 0;
    color: #ff9bb5;
    font-size: 0.9rem;
  }

  .auth-success {
    margin: -0.4rem 0 0;
    color: #8ef6c0;
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
