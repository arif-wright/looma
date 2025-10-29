<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy } from 'svelte';
  import PostCard from '$lib/social/PostCard.svelte';
  import type { FeedItem as FeedItemType } from '$lib/social/types';
  import ReactionBar from '$lib/components/common/ReactionBar.svelte';
  import type { ReactionCounts, ReactionKind } from '$lib/lib/reactions';
  import ShareModal from '$lib/components/feed/ShareModal.svelte';
  import { createShare, ShareError } from '$lib/lib/shares';

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

  const mapCounts = (post: FeedItemType): ReactionCounts => ({
    like: Number(post?.reactions_like ?? post?.reaction_like_count ?? 0),
    cheer: Number(post?.reactions_cheer ?? post?.reaction_support_count ?? 0),
    spark: Number(post?.reactions_spark ?? post?.reaction_spark_count ?? 0)
  });

  const mapStates = (post: FeedItemType): Record<ReactionKind, boolean> => ({
    like: post?.current_user_reaction === 'like',
    cheer:
      post?.current_user_reaction === 'cheer' || post?.current_user_reaction === 'support',
    spark: post?.current_user_reaction === 'spark'
  });

  let reactionCounts: ReactionCounts = mapCounts(item);
  let reactionStates: Record<ReactionKind, boolean> = mapStates(item);
  let lastPostId: string | null = item?.id ?? null;
  type SharedBy = NonNullable<FeedItemType['sharedBy']>;
  let sharesCount = Number(item?.shares_count ?? 0);
  let sharedBy: SharedBy | null = item?.sharedBy ?? null;
  let sharePending = false;
  let quoteOpen = false;
  type ToastState = { kind: 'success' | 'error'; message: string } | null;
  let toast: ToastState = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  $: {
    const nextId = item?.id ?? null;
    if (nextId !== lastPostId) {
      lastPostId = nextId;
      reactionCounts = mapCounts(item);
      reactionStates = mapStates(item);
      sharesCount = Number(item?.shares_count ?? 0);
      sharedBy = (item?.sharedBy ?? null) as SharedBy | null;
      sharePending = false;
      quoteOpen = false;
      toast = null;
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
    }
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  function openDeepLink() {
    if (!target) return;
    dispatch('deeplink', { target, item });
  }

  function handleReactionChange(event: CustomEvent<{ counts: ReactionCounts; states: Record<ReactionKind, boolean> }>) {
    reactionCounts = { ...event.detail.counts };
    reactionStates = { ...event.detail.states };

    // keep underlying item snapshot in sync for downstream consumers
    item = {
      ...item,
      reactions_like: reactionCounts.like,
      reactions_cheer: reactionCounts.cheer,
      reactions_spark: reactionCounts.spark,
      reaction_like_count: reactionCounts.like,
      reaction_support_count: reactionCounts.cheer,
      reaction_spark_count: reactionCounts.spark,
      current_user_reaction: reactionStates.like
        ? 'like'
        : reactionStates.cheer
        ? 'support'
        : reactionStates.spark
        ? 'spark'
        : null
    };
  }

  function showToast(next: ToastState, duration = 2600) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = next;
    if (next) {
      toastTimer = setTimeout(() => {
        toast = null;
      }, duration);
    }
  }

  async function handleRepost() {
    if (!item?.id || sharePending) return;
    sharePending = true;

    try {
      const result = await createShare(item.id);
      sharesCount = Number.isFinite(result.shares_count) ? result.shares_count : sharesCount + 1;
      const nextShared: SharedBy = { ...(item.sharedBy ?? { id: null }), is_self: true };
      sharedBy = nextShared;
      item = {
        ...item,
        shares_count: sharesCount,
        sharedBy: nextShared
      };
      showToast({ kind: 'success', message: 'Reposted!' }, 2000);
    } catch (error) {
      const shareError = error instanceof ShareError ? error : null;
      const status = shareError?.status ?? 500;
      let message = shareError?.message ?? 'Unable to share right now.';
      if (status === 401) {
        message = 'Please sign in to share.';
      } else if (status === 429) {
        message = shareError?.message ?? 'You are sharing too quickly.';
      }
      showToast({ kind: 'error', message });
    } finally {
      sharePending = false;
    }
  }

  function handleQuoteShared(event: CustomEvent<{ sharesCount: number }>) {
    const nextCount = Number.isFinite(event.detail.sharesCount)
      ? event.detail.sharesCount
      : sharesCount + 1;
    sharesCount = nextCount;
    const nextShared: SharedBy = { ...(item.sharedBy ?? { id: null }), is_self: true };
    sharedBy = nextShared;
    item = {
      ...item,
      shares_count: sharesCount,
      sharedBy: nextShared
    };
    quoteOpen = false;
    showToast({ kind: 'success', message: 'Shared with quote!' }, 2000);
  }

  function handleQuoteError(event: CustomEvent<{ status: number; message: string }>) {
    const { status, message } = event.detail;
    const toastMessage =
      status === 401 ? 'Please sign in to share.' : message || 'Unable to share right now.';
    showToast({ kind: 'error', message: toastMessage });
  }

  function openQuoteModal() {
    if (!item?.id) return;
    quoteOpen = true;
  }

  function handleModalClose() {
    quoteOpen = false;
  }
</script>

<article class="feed-item" data-testid="feed-item" data-post-id={item?.id ?? ''}>
  {#if sharedBy?.is_self}
    <div class="feed-item__shared-indicator">Reposted by you</div>
  {/if}

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

  {#if item?.id}
    <div class="feed-item__actions">
      <div class="feed-item__share">
        <button
          type="button"
          class="share-btn"
          data-testid="repost"
          aria-label="Repost this item"
          on:click={handleRepost}
          disabled={sharePending}
        >
          Repost
        </button>
        <button
          type="button"
          class="share-btn secondary"
          data-testid="quote-share"
          aria-label="Quote and repost this item"
          on:click={openQuoteModal}
          disabled={sharePending}
        >
          Quote
        </button>
        <span class="share-count" aria-live="polite">
          {sharesCount} {sharesCount === 1 ? 'share' : 'shares'}
        </span>
      </div>

      <ReactionBar
        target={{ type: 'post', id: item.id }}
        counts={reactionCounts}
        states={reactionStates}
        on:change={handleReactionChange}
      />
    </div>
  {/if}

  {#if ctaLabel}
    <footer class="feed-item__deeplink">
      <button type="button" class="deeplink-btn" on:click={openDeepLink}>
        {ctaLabel}
      </button>
    </footer>
  {/if}

  {#if toast}
    <div
      class={`feed-item__toast ${toast.kind}`}
      data-testid={toast.kind === 'success' ? 'toast-success' : 'toast-error'}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  {/if}

  <ShareModal
    postId={item?.id ?? ''}
    open={quoteOpen}
    on:close={handleModalClose}
    on:shared={handleQuoteShared}
    on:error={handleQuoteError}
  />
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

  .feed-item__shared-indicator {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(56, 189, 248, 0.75);
  }

  .feed-item__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feed-item__share {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .share-btn {
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    background: rgba(56, 189, 248, 0.15);
    color: rgba(240, 249, 255, 0.95);
    border: 1px solid rgba(56, 189, 248, 0.45);
    transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }

  .share-btn.secondary {
    background: transparent;
    color: rgba(148, 163, 184, 0.92);
    border-color: rgba(148, 163, 184, 0.35);
  }

  .share-btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .share-btn:not(:disabled):hover,
  .share-btn:not(:disabled):focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 12px 20px rgba(56, 189, 248, 0.2);
  }

  .share-count {
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
    font-variant-numeric: tabular-nums;
  }

  .feed-item__toast {
    margin-top: 8px;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 0.78rem;
    background: rgba(15, 23, 42, 0.85);
    color: rgba(241, 245, 249, 0.96);
    border: 1px solid transparent;
  }

  .feed-item__toast.success {
    border-color: rgba(34, 197, 94, 0.4);
  }

  .feed-item__toast.error {
    border-color: rgba(248, 113, 113, 0.45);
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

  @media (max-width: 640px) {
    .feed-item__actions {
      gap: 10px;
    }

    .feed-item__share {
      gap: 10px;
    }
  }
</style>
