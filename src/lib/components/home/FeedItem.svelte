<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher } from 'svelte';
  import PostCard from '$lib/social/PostCard.svelte';
  import type { FeedItem as FeedItemType } from '$lib/social/types';

  export let item: FeedItemType;

  const dispatch = createEventDispatcher<{
    deeplink: { target: Record<string, unknown>; item: FeedItemType };
  }>();

  const target =
    item?.deep_link_target && typeof item.deep_link_target === 'object'
      ? (item.deep_link_target as Record<string, unknown>)
      : null;
  const targetType =
    target && typeof target.type === 'string'
      ? (target.type as 'mission' | 'creature' | string)
      : null;

  const ctaLabel =
    targetType === 'mission'
      ? '🚀 Join Mission'
      : targetType === 'creature'
      ? '🐾 Visit Companion'
      : null;

  function openDeepLink() {
    if (!target) return;
    dispatch('deeplink', { target, item });
  }
</script>

<article class="feed-item">
  <header class="feed-item__meta">
    <span
      class={`feed-item__chip ${item.is_follow ? 'chip-follow' : 'chip-discovery'}`}
      aria-label={item.is_follow ? 'From creators you follow' : 'Suggested for you'}
    >
      {item.is_follow ? 'Following' : 'Discovery'}
    </span>
    <span class="feed-item__score" aria-label={`Relevance score ${item.score?.toFixed(2) ?? '0.00'}`}>
      score {(item.score ?? 0).toFixed(2)}
    </span>
  </header>

  {#if browser}
    <PostCard post={item} />
  {:else}
    <div class="feed-item__placeholder">
      Loading personalized post…
    </div>
  {/if}

  {#if ctaLabel}
    <footer class="feed-item__deeplink">
      <button type="button" class="deeplink-btn" on:click={openDeepLink}>
        {ctaLabel}
      </button>
    </footer>
  {/if}
</article>

<style>
  .feed-item {
    display: grid;
    gap: 12px;
  }

  .feed-item__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .feed-item__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: rgba(148, 163, 184, 0.12);
    color: rgba(226, 232, 240, 0.85);
    font-weight: 600;
  }

  .chip-follow {
    border-color: var(--theme-accent-ring, rgba(74, 222, 128, 0.35));
    background: var(--theme-accent-soft, rgba(74, 222, 128, 0.12));
    color: rgba(226, 232, 240, 0.92);
  }

  .chip-discovery {
    border-color: var(--theme-accent-ring, rgba(56, 189, 248, 0.35));
    background: var(--theme-accent-soft, rgba(56, 189, 248, 0.12));
    color: rgba(226, 232, 240, 0.92);
  }

  .feed-item__score {
    font-variant-numeric: tabular-nums;
    color: rgba(148, 163, 184, 0.7);
  }

  .feed-item__placeholder {
    border-radius: 16px;
    border: 1px dashed rgba(148, 163, 184, 0.35);
    padding: 24px;
    text-align: center;
    color: rgba(148, 163, 184, 0.7);
    font-size: 0.9rem;
  }

  .feed-item__deeplink {
    display: flex;
    justify-content: flex-end;
  }

  .deeplink-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid var(--theme-accent-ring, rgba(56, 189, 248, 0.45));
    background: var(--theme-accent-soft, rgba(56, 189, 248, 0.14));
    color: rgba(224, 242, 254, 0.95);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }

  .deeplink-btn:hover,
  .deeplink-btn:focus-visible {
    background: var(--theme-accent, rgba(56, 189, 248, 0.24));
    box-shadow: 0 10px 24px var(--theme-accent-soft, rgba(56, 189, 248, 0.25));
    transform: translateY(-1px);
  }

  @media (prefers-reduced-motion: reduce) {
    .deeplink-btn {
      transition: background 0.2s ease;
    }
    .deeplink-btn:hover,
    .deeplink-btn:focus-visible {
      transform: none;
    }
  }
</style>
