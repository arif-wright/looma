<script lang="ts">
  import { onDestroy } from 'svelte';

  export let message: string = '';
  export let kind: 'success' | 'error' = 'success';
  export let show: boolean = false;
  export let onClose: () => void = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;

  $: if (show) {
    clearTimeout(timeout);
    timeout = setTimeout(() => onClose(), 3200);
  }

  onDestroy(() => clearTimeout(timeout));
</script>

{#if show}
  <div
    class="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full
           px-4 py-2 text-sm shadow-lg backdrop-blur
           ring-1 ring-white/10
           {kind === 'success' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}">
    {message}
  </div>
{/if}
