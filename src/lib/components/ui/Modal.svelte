<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  export let open = false;
  export let title = 'Edit profile';
  export let onClose: () => void = () => {};

  let dialogEl: HTMLDivElement;
  let lastActive: HTMLElement | null = null;

  function close() {
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.overflow = '';
      lastActive?.focus?.();
    }
  });

  $: if (typeof document !== 'undefined') {
    if (open) {
      lastActive = document.activeElement as HTMLElement;
      setTimeout(() => dialogEl?.focus(), 0);
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      lastActive?.focus?.();
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[100]">
    <div class="absolute inset-0 bg-black/60" on:click={close} aria-hidden="true"></div>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="0"
      bind:this={dialogEl}
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,92vw)] max-h-[85vh] rounded-2xl bg-[rgba(20,22,35,0.9)] backdrop-blur-md ring-1 ring-white/10 flex flex-col overflow-hidden"
    >
      <div class="modal-header flex items-center justify-between gap-3">
        <h2 class="text-base sm:text-lg font-semibold">{title}</h2>
        <button class="btn btn-xs" on:click={close} aria-label="Close">✕</button>
      </div>
      <div class="modal-body flex-1 overflow-y-auto">
        <div class="modal-scroll-content">
          <slot />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-header {
    padding: 1rem 1.5rem 0.75rem;
  }

  @media (min-width: 640px) {
    .modal-header {
      padding: 1.5rem 2rem 1rem;
    }
  }

  .modal-body {
    scrollbar-gutter: stable;
  }

  .modal-scroll-content {
    padding: 0 1.5rem 1.5rem;
  }

  @media (min-width: 640px) {
    .modal-scroll-content {
      padding: 0 2rem 2rem;
    }
  }

  .modal-body::-webkit-scrollbar {
    width: 8px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .modal-body::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .modal-body {
    scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
  }
</style>
