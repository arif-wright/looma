<script lang="ts">
  import { onMount } from 'svelte';
  import { logEvent } from '$lib/analytics';

  export let open = false;
  export let onClose: () => void = () => {};
  export let onUnlocked: (newMax: number) => void = () => {};

  let busy = false;
  let qtyLoading = false;
  let qty = 0;
  let errorMsg = '';
  let dialogEl: HTMLDivElement | null = null;
  let lastFocus: HTMLElement | null = null;
  let wasOpen = false;

  const tryClose = () => {
    if (busy) return;
    onClose();
  };

  const loadQty = async () => {
    if (qtyLoading) return;
    qtyLoading = true;
    try {
      const res = await fetch('/api/companions/slots/license');
      const payload = await res.json().catch(() => null);
      qty = res.ok ? Number(payload?.qty ?? 0) : 0;
    } catch {
      qty = 0;
    } finally {
      qtyLoading = false;
    }
  };

  const useLicense = async () => {
    busy = true;
    errorMsg = '';
    logEvent('slot_license_use_attempt', { qtyBefore: qty });
    try {
      const res = await fetch('/api/companions/slots/license', { method: 'POST' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to use license');
      }
      const maxSlots = Number(payload?.maxSlots ?? 0) || 0;
      onUnlocked(maxSlots);
      logEvent('slot_unlocked', { maxSlots, source: 'license' });
      onClose();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to use license';
      logEvent('slot_license_use_failed', { message: errorMsg });
    } finally {
      busy = false;
      void loadQty();
    }
  };

  const buyLicense = () => {
    logEvent('slot_license_buy_click');
    if (typeof window !== 'undefined') {
      window.location.href = '/app/shop?slug=slot-license';
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

  $: if (open && !wasOpen) {
    wasOpen = true;
    errorMsg = '';
    logEvent('slot_unlock_modal_open');
    void loadQty();
  } else if (!open && wasOpen) {
    wasOpen = false;
  }

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
      <p class="unlock-copy">
        Use a <strong>Companion Slot License</strong> to permanently increase your roster capacity.
      </p>
      <p class="unlock-meta">You currently have <span class="qty" aria-live="polite">{qtyLoading ? '…' : qty}</span> license{qty === 1 ? '' : 's'}.</p>
      {#if errorMsg}
        <p class="unlock-error" aria-live="assertive" role="alert">{errorMsg}</p>
      {/if}
      <div class="unlock-actions">
        {#if qty > 0}
          <button type="button" class="unlock-primary" on:click={useLicense} disabled={busy}>
            {busy ? 'Unlocking…' : 'Use License'}
          </button>
        {:else}
          <button type="button" class="unlock-primary" on:click={buyLicense}>
            Buy License
          </button>
        {/if}
        <button type="button" class="unlock-secondary" on:click={tryClose}>
          Not now
        </button>
      </div>
      <p class="unlock-footnote">
        Buying a license in the shop adds it to your inventory. Using one consumes it and unlocks a new companion slot.
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

  .unlock-meta {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .qty {
    font-weight: 600;
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
