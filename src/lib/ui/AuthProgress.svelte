<script lang="ts">
  import { onMount } from 'svelte';

  export type AuthProgressState = 'processing' | 'success' | 'error';

  export let state: AuthProgressState = 'processing';
  export let message: string | undefined = 'Signing you in...';
  export let next: string | null | undefined = null;
  export let errorMessage: string | null | undefined = null;
  export let onRetry: (() => void) | null | undefined = undefined;

  let headingEl: HTMLHeadingElement | null = null;

  onMount(() => {
    headingEl?.focus();
  });

  $: isProcessing = state === 'processing';
  $: isSuccess = state === 'success';
  $: isError = state === 'error';

  $: displayMessage = (() => {
    if (isError) return errorMessage ?? 'Something went wrong. Please try again.';
    if (isSuccess) {
      if (next) return `Redirecting to ${next}`;
      return 'Redirecting...';
    }
    return message ?? 'Signing you in...';
  })();

  function handleRetry() {
    onRetry?.();
  }
</script>

<section class="auth-progress" aria-live="polite" role="status">
  <div class="box">
    <div class="icon" data-state={state} aria-hidden="true">
      {#if isProcessing}
        <span class="spinner"></span>
      {:else if isSuccess}
        <span class="success" aria-hidden="true">✓</span>
      {:else}
        <span class="error" aria-hidden="true">!</span>
      {/if}
    </div>
    <h1 tabindex="-1" bind:this={headingEl}>
      {#if isProcessing}
        {message ?? 'Signing you in...'}
      {:else if isSuccess}
        Signed in
      {:else}
        Sign-in Issue
      {/if}
    </h1>
    <p>{displayMessage}</p>
    {#if isError}
      <button type="button" class="retry" on:click={handleRetry}>
        Retry
      </button>
    {/if}
  </div>
</section>

<style>
  .auth-progress {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #f9fafb;
  }

  .box {
    display: grid;
    gap: 0.875rem;
    justify-items: center;
    text-align: center;
    max-width: 30rem;
  }

  .icon {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
  }

  .spinner {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 4px solid #e5e7eb;
    border-top-color: #111827;
    animation: spin 1s linear infinite;
  }

  .success,
  .error {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
  }

  .success {
    background: #047857;
  }

  .error {
    background: #dc2626;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  h1 {
    font-size: 1.35rem;
    margin: 0;
    line-height: 1.3;
  }

  p {
    margin: 0;
    color: #4b5563;
    line-height: 1.5;
  }

  .retry {
    margin-top: 0.75rem;
    background: #111827;
    color: #fff;
    border: none;
    padding: 0.5rem 1.1rem;
    border-radius: 9999px;
    cursor: pointer;
  }

  .retry:hover,
  .retry:focus-visible {
    background: #1f2937;
  }
</style>
