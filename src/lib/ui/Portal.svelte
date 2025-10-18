<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  export let target: string | HTMLElement = 'body';

  let host: HTMLDivElement;
  let mountEl: HTMLElement | null = null;

  function resolveTarget(): HTMLElement | null {
    if (!browser) return null;
    if (typeof target === 'string') {
      return (document.querySelector(target) as HTMLElement | null) ?? document.body;
    }
    return target ?? document.body;
  }

  onMount(() => {
    if (!browser) return;
    mountEl = resolveTarget();
    if (mountEl && host) {
      mountEl.appendChild(host);
    }
  });

  onDestroy(() => {
    if (!browser) return;
    try {
      host?.parentNode?.removeChild?.(host);
    } catch {
      // ignore detach errors
    }
  });
</script>

{#if browser}
  <div bind:this={host}>
    <slot />
  </div>
{/if}
