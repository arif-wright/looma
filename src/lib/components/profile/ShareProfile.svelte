<script lang="ts">
  import { onDestroy } from 'svelte';

  export let url = '';
  export let title = 'Check out my Looma profile';

  let message = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const notify = (text: string) => {
    message = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (message = ''), 1600);
  };

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  const share = async () => {
    if (!url) return;
    if (typeof navigator === 'undefined') {
      notify('Share not available');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify('Link copied');
      }
    } catch {
      notify('Share failed');
    }
  };
</script>

<div class="share-wrap">
  <button type="button" class="btn btn-sm" on:click={share}>
    Share profile
  </button>
  {#if message}
    <span class="share-status">{message}</span>
  {/if}
</div>

<style>
  .share-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .share-status {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.75);
  }
</style>
