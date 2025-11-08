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
    document.documentElement.style.overflow = '';
    lastActive?.focus?.();
  });

  $: if (open) {
    lastActive = document.activeElement as HTMLElement;
    setTimeout(() => dialogEl?.focus(), 0);
    document.documentElement.style.overflow = 'hidden';
  } else {
    document.documentElement.style.overflow = '';
    lastActive?.focus?.();
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
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(720px,92vw)] max-h-[85vh] overflow-auto rounded-2xl bg-[rgba(20,22,35,0.9)] backdrop-blur-md ring-1 ring-white/10 p-4 sm:p-6"
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base sm:text-lg font-semibold">{title}</h2>
        <button class="btn btn-xs" on:click={close} aria-label="Close">✕</button>
      </div>
      <slot />
    </div>
  </div>
{/if}
