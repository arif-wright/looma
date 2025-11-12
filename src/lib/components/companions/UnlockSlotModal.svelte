<script lang="ts">
  import { onMount } from 'svelte';

  export let open = false;
  export let onClose: () => void = () => {};
  export let onUnlock: () => Promise<void> = async () => {};

  let busy = false;
  let errorMsg = '';
  let dialogEl: HTMLDivElement | null = null;
  let lastFocus: HTMLElement | null = null;

  const tryClose = () => {
    if (busy) return;
    onClose();
  };

  const unlock = async () => {
    busy = true;
    errorMsg = '';
    try {
      await onUnlock();
      onClose();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Unlock failed';
    } finally {
      busy = false;
    }
  };

  onMount(() => {
    if (typeof document === 'undefined') return;
    const handler = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        tryClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  $: if (typeof document !== 'undefined') {
    if (open) {
      lastFocus = document.activeElement as HTMLElement;
      setTimeout(() => dialogEl?.focus(), 0);
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      lastFocus?.focus?.();
    }
  }
</script>

{#if open}
  <div class="unlock-overlay" aria-hidden="false">
    <div class="unlock-backdrop" on:click={tryClose} aria-hidden="true"></div>
    <div
      class="unlock-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
      tabindex="-1"
      bind:this={dialogEl}
    >
      <h2 id="unlock-title">Unlock an extra companion slot</h2>
      <p class="unlock-copy">
        You have reached your current slot limit. Unlock another slot to welcome an additional companion into your active roster.
      </p>
      {#if errorMsg}
        <p class="unlock-error" role="alert">{errorMsg}</p>
      {/if}
      <div class="unlock-actions">
        <button type="button" class="unlock-primary" on:click={unlock} disabled={busy}>
          {busy ? 'Unlocking…' : 'Unlock slot'}
        </button>
        <button type="button" class="unlock-secondary" on:click={tryClose}>
          Not now
        </button>
      </div>
      <p class="unlock-footnote">
        Future phases may require an inventory item or purchase to unlock additional slots.
      </p>
    </div>
  </div>
{/if}

<style>
  .unlock-overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
  }

  .unlock-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
  }

  .unlock-modal {
    position: relative;
    width: min(420px, 92vw);
    background: rgba(12, 14, 24, 0.95);
    border-radius: 24px;
    padding: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
    color: #fff;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.35rem;
  }

  .unlock-copy {
    margin: 0 0 1rem;
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.95rem;
  }

  .unlock-error {
    margin: 0 0 0.75rem;
    color: #fecaca;
    font-size: 0.9rem;
  }

  .unlock-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .unlock-primary,
  .unlock-secondary {
    flex: 1;
    border-radius: 14px;
    padding: 0.65rem 1rem;
    font-size: 0.95rem;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.18);
    transition: background 150ms ease, border-color 150ms ease;
  }

  .unlock-primary {
    background: rgba(255, 255, 255, 0.12);
  }

  .unlock-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .unlock-primary:hover:not(:disabled),
  .unlock-primary:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    outline: none;
  }

  .unlock-secondary {
    background: transparent;
  }

  .unlock-secondary:hover,
  .unlock-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    outline: none;
  }

  .unlock-footnote {
    margin-top: 1rem;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 480px) {
    .unlock-modal {
      padding: 1.5rem;
    }
  }
</style>
