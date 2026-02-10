<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { X } from 'lucide-svelte';

  export let open = false;
  export let title: string | null = null;
  export let closeLabel = 'Close';
  export let closeOnBackdrop = true;
  export let closeOnEscape = true;
  export let onClose: () => void = () => {};

  let previousBodyOverflow: string | null = null;
  let previousMainOverflow: string | null = null;
  let previousBodyTouchAction: string | null = null;

  const lockScroll = () => {
    if (!browser) return;
    if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
    if (previousBodyTouchAction === null) previousBodyTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const main = document.querySelector('main.app-main') as HTMLElement | null;
    if (main) {
      if (previousMainOverflow === null) previousMainOverflow = main.style.overflow;
      main.style.overflow = 'hidden';
    }
  };

  const unlockScroll = () => {
    if (!browser) return;
    if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow;
    if (previousBodyTouchAction !== null) document.body.style.touchAction = previousBodyTouchAction;
    previousBodyOverflow = null;
    previousBodyTouchAction = null;

    const main = document.querySelector('main.app-main') as HTMLElement | null;
    if (main && previousMainOverflow !== null) {
      main.style.overflow = previousMainOverflow;
      previousMainOverflow = null;
    }
  };

  const requestClose = () => {
    onClose?.();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!open) return;
    if (!closeOnEscape) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    requestClose();
  };

  $: if (browser) {
    if (open) lockScroll();
    else unlockScroll();
  }

  $: if (browser) {
    window.removeEventListener('keydown', handleKeydown);
    if (open) window.addEventListener('keydown', handleKeydown);
  }

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('keydown', handleKeydown);
    unlockScroll();
  });
</script>

{#if open}
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title ?? 'Sheet'}>
    <button
      type="button"
      class="backdrop"
      aria-label="Close sheet"
      on:click={() => {
        if (!closeOnBackdrop) return;
        requestClose();
      }}
      transition:fade={{ duration: 140 }}
    ></button>

    <section class="panel" transition:fly={{ y: 220, duration: 180 }}>
      <header class="head">
        <div class="title">
          {#if title}
            <h2>{title}</h2>
          {/if}
        </div>
        <button type="button" class="close" aria-label={closeLabel} on:click={requestClose}>
          <X size={18} />
        </button>
      </header>

      <div class="content">
        <slot />
      </div>
    </section>
  </div>
{/if}

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    align-items: end;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(2, 6, 23, 0.6);
    backdrop-filter: blur(2px);
    border: 0;
  }

  .panel {
    position: relative;
    width: min(720px, 100%);
    margin: 0 auto;
    border-radius: 18px 18px 0 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 12, 24, 0.92);
    box-shadow: 0 -26px 55px rgba(2, 6, 23, 0.65);
    padding: 0.95rem 1rem 1.25rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .title h2 {
    margin: 0;
    font-size: 0.95rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .close {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.65);
    color: rgba(248, 250, 252, 0.9);
  }

  .content {
    margin-top: 0.75rem;
    display: grid;
    gap: 0.75rem;
  }
</style>
