<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { z } from 'zod';
  import { createSupabaseBrowserClient } from '$lib/supabase/client';
  import { env } from '$env/dynamic/public';

  export let data: { next?: string | null };

  const ACCENT_GRADIENT = 'linear-gradient(125deg, #d4ad5c, #a6793d)';
  const supabase = createSupabaseBrowserClient();
  const schema = z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long')
  });

  const oauthFlags = {
    google: env.PUBLIC_OAUTH_GOOGLE === 'true'
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

    const configuredBase = env.PUBLIC_SITE_URL?.replace(/\/$/, '') || null;
    const resolvedOrigin =
      configuredBase ??
      (typeof window !== 'undefined' ? window.location.origin : get(page).url.origin);
    const rawCallback = (env.PUBLIC_AUTH_CALLBACK || '/auth/callback').trim();
    const callbackIsAbsolute = /^https?:\/\//.test(rawCallback);
    const normalizedCallback = callbackIsAbsolute
      ? rawCallback
      : rawCallback.startsWith('/')
        ? rawCallback
        : `/${rawCallback}`;
    const redirectUrl = callbackIsAbsolute ? normalizedCallback : `${resolvedOrigin}${normalizedCallback}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
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
    <p class="auth-card__eyebrow">Return to sanctuary</p>
    <h1>Step back into the bond you have been building.</h1>
    <p>Pick up your companion, journal, and conversations where you left them.</p>
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
      linear-gradient(155deg, rgba(29, 24, 17, 0.82), rgba(12, 15, 18, 0.7));
    border: 1px solid rgba(214, 190, 141, 0.18);
    border-radius: 22px;
    padding: clamp(2.3rem, 3vw, 3rem);
    backdrop-filter: blur(38px) saturate(165%);
    box-shadow:
      0 28px 70px rgba(5, 8, 10, 0.42),
      inset 0 0 0 1px rgba(255, 245, 224, 0.04);
    animation: fadeUp 620ms cubic-bezier(0.26, 0.78, 0.33, 0.99) both;
    color: #f8f1e3;
    position: relative;
    overflow: hidden;
  }

  .auth-card::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    background:
      linear-gradient(115deg, rgba(255, 244, 221, 0.14), transparent 55%),
      radial-gradient(circle at 22% 20%, rgba(214, 190, 141, 0.14), transparent 55%),
      radial-gradient(circle at 82% 80%, rgba(128, 175, 148, 0.12), transparent 58%);
    opacity: 0.7;
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

  .auth-card__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .auth-card__header h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.4rem);
    font-weight: 600;
    color: #fff8ed;
    letter-spacing: -0.01em;
  }

  .auth-card__header p {
    margin: 0;
    font-size: 1rem;
    color: rgba(226, 214, 191, 0.8);
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
    color: rgba(238, 228, 208, 0.8);
  }

  input {
    width: 100%;
    padding: 0.9rem 1rem;
    border-radius: 14px;
    background: rgba(16, 18, 19, 0.72);
    border: 1px solid rgba(214, 190, 141, 0.16);
    color: inherit;
    font-size: 1rem;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      background 220ms ease;
  }

  input::placeholder {
    color: rgba(205, 194, 172, 0.48);
  }

  input:focus-visible {
    outline: none;
    border-color: rgba(214, 190, 141, 0.7);
    box-shadow:
      0 0 0 2px rgba(214, 190, 141, 0.22),
      0 15px 30px rgba(166, 121, 61, 0.14);
    background: rgba(19, 22, 24, 0.86);
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
    color: #191109;
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
      0 18px 40px rgba(214, 190, 141, 0.18),
      0 8px 20px rgba(166, 121, 61, 0.24);
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
    color: rgba(214, 203, 180, 0.38);
  }

  .auth-divider::before,
  .auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(214, 190, 141, 0.14), transparent);
  }

  .auth-divider::after {
    background: linear-gradient(90deg, transparent, rgba(214, 190, 141, 0.14));
  }

  .auth-oauth {
    display: grid;
    gap: 0.75rem;
  }

  .auth-oauth__button {
    width: 100%;
    padding: 0.85rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(18, 20, 21, 0.7);
    color: #f5ecda;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 180ms ease,
      background 200ms ease,
      box-shadow 220ms ease;
  }

  .auth-oauth__button:not(:disabled):hover,
  .auth-oauth__button:not(:disabled):focus-visible {
    background: rgba(28, 24, 19, 0.84);
    border-color: rgba(214, 190, 141, 0.34);
    box-shadow: 0 12px 30px rgba(166, 121, 61, 0.18);
  }

  .auth-oauth__button:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .auth-footnote {
    margin: 2.25rem 0 0;
    font-size: 0.95rem;
    color: rgba(222, 211, 189, 0.72);
  }

  .auth-link {
    color: #e6cb92;
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
      box-shadow: 0 0 0 0 rgba(214, 190, 141, 0.34);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 16px rgba(214, 190, 141, 0);
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
