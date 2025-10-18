<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  export let target: string | HTMLElement = '#modal-root';
  let host: HTMLDivElement;
  let mountEl: HTMLElement | null = null;

  function ensureRoot(): HTMLElement | null {
    if (!browser) return null;
    let el = document.querySelector('#modal-root') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-root';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = String(2147483647);
      document.body.appendChild(el);
    }
    return el;
  }

  function resolveTarget(): HTMLElement | null {
    if (!browser) return null;
    if (typeof target === 'string') {
      return (document.querySelector(target) as HTMLElement) ?? ensureRoot();
    }
    return target ?? ensureRoot();
  }

  onMount(() => {
    if (!browser) return;
    mountEl = resolveTarget() ?? document.body;
    mountEl.appendChild(host);
  });

  onDestroy(() => {
    if (!browser) return;
    try { host?.parentNode?.removeChild?.(host); } catch {}
  });
</script>

<div bind:this={host} style="pointer-events:auto;"><slot /></div>
