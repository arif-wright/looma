<script lang="ts">
  import { onDestroy } from 'svelte';
  import { companionReaction, type CompanionReaction } from '$lib/stores/companionReactions';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { browser } from '$app/environment';

  let timer: ReturnType<typeof setTimeout> | null = null;
  let prefersReducedMotion = false;

  if (browser) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = media.matches;
    const handler = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
    };
    if (media.addEventListener) {
      media.addEventListener('change', handler);
    } else {
      media.addListener(handler);
    }
    onDestroy(() => {
      if (media.removeEventListener) {
        media.removeEventListener('change', handler);
      } else {
        media.removeListener(handler);
      }
    });
  }

  const opacity = tweened(1, { duration: 180, easing: cubicOut });
  const dismiss = () => {
    companionReaction.set(null);
  };

  const scheduleDismiss = (reaction: CompanionReaction | null) => {
    if (timer) clearTimeout(timer);
    if (!reaction) return;
    const ttl = typeof reaction.ttlMs === 'number' ? reaction.ttlMs : 3500;
    timer = setTimeout(() => {
      dismiss();
    }, ttl);
  };

  $: scheduleDismiss($companionReaction);

  $: if (prefersReducedMotion) {
    opacity.set(1);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if $companionReaction}
  <button
    type="button"
    class="reaction-toast"
    aria-live="polite"
    aria-label="Dismiss companion reaction"
    style={`opacity: ${$opacity};`}
    on:click={dismiss}
  >
    <span>{$companionReaction.text}</span>
  </button>
{/if}

<style>
  .reaction-toast {
    max-width: 240px;
    padding: 0.55rem 0.9rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 26, 0.85);
    box-shadow: 0 10px 30px rgba(4, 8, 20, 0.45);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
    line-height: 1.3;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-toast {
      transition: none;
    }
  }
</style>
