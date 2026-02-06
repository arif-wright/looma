<script lang="ts">
  import { onDestroy } from 'svelte';
  import { companionReaction, type CompanionReaction } from '$lib/stores/companionReactions';

  let timer: ReturnType<typeof setTimeout> | null = null;

  const dismiss = () => {
    companionReaction.set(null);
  };

  const scheduleDismiss = (reaction: CompanionReaction | null) => {
    if (timer) clearTimeout(timer);
    if (!reaction) return;
    const ttl = typeof reaction.ttlMs === 'number' ? reaction.ttlMs : 3500;
    timer = setTimeout(() => {
      dismiss();
    }, Math.max(500, ttl));
  };

  $: scheduleDismiss($companionReaction);

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if $companionReaction}
  <div class="reaction-bubble" role="status" aria-live="polite">
    <p>{$companionReaction.text}</p>
    <button type="button" class="reaction-bubble__dismiss" on:click={dismiss} aria-label="Dismiss reaction">x</button>
  </div>
{/if}

<style>
  .reaction-bubble {
    max-width: 240px;
    padding: 0.5rem 0.65rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(9, 12, 24, 0.9);
    box-shadow: 0 12px 28px rgba(4, 8, 20, 0.45);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.83rem;
    line-height: 1.3;
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    animation: bubble-in 140ms ease-out;
  }

  .reaction-bubble p {
    margin: 0;
    flex: 1;
  }

  .reaction-bubble__dismiss {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
    line-height: 1;
    font-size: 0.72rem;
    padding: 0;
    flex: 0 0 auto;
  }

  @keyframes bubble-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-bubble {
      animation: none;
    }
  }
</style>
