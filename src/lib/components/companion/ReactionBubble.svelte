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
    <p title={$companionReaction.text}>{$companionReaction.text}</p>
    <button type="button" class="reaction-bubble__dismiss" on:click={dismiss} aria-label="Dismiss reaction">x</button>
  </div>
{/if}

<style>
  .reaction-bubble {
    width: clamp(200px, 85%, 280px);
    min-width: 200px;
    max-width: min(280px, calc(100vw - 2rem));
    padding: 0.62rem 0.78rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(9, 12, 24, 0.9);
    box-shadow: 0 12px 28px rgba(4, 8, 20, 0.45);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    line-height: 1.4;
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    animation: bubble-in 140ms ease-out;
  }

  .reaction-bubble p {
    margin: 0;
    flex: 1;
    min-width: 0;
    white-space: normal;
    word-break: normal;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .reaction-bubble__dismiss {
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
    line-height: 1;
    font-size: 0.75rem;
    padding: 0;
    flex: 0 0 auto;
  }

  @media (max-width: 720px) {
    .reaction-bubble {
      width: clamp(190px, 88vw, 260px);
      min-width: 190px;
      max-width: min(260px, calc(100vw - 2rem));
      font-size: 0.86rem;
      line-height: 1.35;
    }
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
