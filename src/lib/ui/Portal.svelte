<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  export let target: string | HTMLElement = '#modal-root';

  let host: HTMLDivElement;
  let mountEl: HTMLElement | null = null;

  function ensureModalRoot(): HTMLElement | null {
    if (!browser) return null;
    let el = document.querySelector('#modal-root') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-root';
      document.body.appendChild(el);
    }
    return el;
  }

  function resolveTarget(): HTMLElement | null {
    if (!browser) return null;
    if (typeof target === 'string') {
      return (document.querySelector(target) as HTMLElement | null) ?? ensureModalRoot();
    }
    return target ?? ensureModalRoot();
  }

  onMount(() => {
    if (!browser) return;
    mountEl = resolveTarget() ?? document.body;
    if (mountEl && host) mountEl.appendChild(host);
  });

  onDestroy(() => {
    if (!browser) return;
    try { host?.parentNode?.removeChild?.(host); } catch {}
  });
</script>

{#if browser}
  <div bind:this={host}>
    <slot />
  </div>
{/if}

<style>
  :global(#modal-root > div) {
    pointer-events: auto;
    position: relative;
  }
</style>
