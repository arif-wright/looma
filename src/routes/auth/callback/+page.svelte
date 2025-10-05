<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import AuthProgress from '$lib/ui/AuthProgress.svelte';
  import {
    consumeHashSession,
    type HashResult,
    sanitizeInternalPath
  } from '$lib/auth/consumeHashSession';

  type ProgressState = 'processing' | 'success' | 'error';

  const STATUS_MESSAGES: Record<HashResult['status'], string> = {
    success: 'Signed in successfully.',
    expired: 'This link has expired. Request a new magic link.',
    invalid: 'This link is invalid or already used.',
    network_error: "We couldn't reach the server. Check your connection and try again."
  };

  let progressState: ProgressState = 'processing';
  let message = 'Signing you in...';
  let nextPath: string | null = null;
  let desiredNext = '/app';
  let errorMessage: string | null = null;
  let lastStatus: HashResult['status'] | null = null;

  function debug(...args: unknown[]) {
    if (import.meta.env.DEV) {
      console.debug('[looma:auth-callback]', ...args);
    }
  }

  async function syncServerCookies() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;

    try {
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });
      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }
    } catch (error) {
      debug('syncServerCookies network error', error);
      throw error;
    }
  }

  function resolveNext(): string {
    if (typeof window === 'undefined') return '/app';
    const params = new URLSearchParams(window.location.search);
    const candidate = sanitizeInternalPath(params.get('next') ?? params.get('redirectTo'));
    return candidate ?? '/app';
  }

  async function processMagicLink() {
    progressState = 'processing';
    message = 'Signing you in...';
    errorMessage = null;
    nextPath = null;
    const target = resolveNext();
    desiredNext = target;
    debug('state -> processing');

    const result = await consumeHashSession();
    lastStatus = result.status;
    debug('consumeHashSession result', result);

    if (result.status !== 'success') {
      progressState = 'error';
      errorMessage = result.message ?? STATUS_MESSAGES[result.status];
      debug('state -> error', errorMessage);
      return;
    }

    try {
      await syncServerCookies();
    } catch (error) {
      progressState = 'error';
      lastStatus = 'network_error';
      errorMessage = STATUS_MESSAGES.network_error;
      debug('state -> error (refresh failed)', error);
      return;
    }

    progressState = 'success';
    nextPath = target;
    debug('state -> success', { nextPath });

    await goto(target, { replaceState: true });
  }

  async function handleRetry() {
    debug('retry requested', { lastStatus });
    if (lastStatus === 'network_error') {
      await processMagicLink();
    } else {
      await goto(`/login?next=${encodeURIComponent(desiredNext)}`);
    }
  }

  onMount(async () => {
    await processMagicLink();
  });
</script>

<AuthProgress
  state={progressState}
  message={message}
  next={nextPath}
  errorMessage={errorMessage}
  onRetry={progressState === 'error' ? handleRetry : undefined}
/>
