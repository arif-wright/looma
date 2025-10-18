<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let target: string | HTMLElement = 'body';

  let host: HTMLDivElement;
  let mountEl: HTMLElement | null = null;

  function resolveTarget() {
    if (typeof target === 'string') {
      const el = document.querySelector(target) as HTMLElement | null;
      return el ?? document.body;
    }
    return target ?? document.body;
  }

  onMount(() => {
    mountEl = resolveTarget();
    mountEl.appendChild(host);
  });

  onDestroy(() => {
    try {
      host?.parentNode?.removeChild(host);
    } catch {
      // ignore
    }
  });
</script>

<div bind:this={host}>
  <slot />
</div>
