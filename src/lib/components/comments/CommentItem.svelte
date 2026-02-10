<script lang="ts">
  import { onDestroy } from 'svelte';
import { canonicalCommentPath } from '$lib/threads/permalink';
import type { Comment } from '$lib/threads/types';
import { copyToClipboard } from '$lib/utils/copy';
import { formatCommentBody, relativeTime } from '$lib/social/commentHelpers';
import ReactionBar from '$lib/components/common/ReactionBar.svelte';
import ReplyComposer from './ReplyComposer.svelte';
import CommentThread from './CommentThread.svelte';
import ReportModal from '$lib/components/modals/ReportModal.svelte';
import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';

  export let comment: Comment;
  export let postId: string;
  export let threadSlug: string | null = null;
  export let threadHandle: string | null = null;
  export let highlightedId: string | null = null;
  export let depth = 0;

  let replyOpen = false;
  let copyStatus: 'idle' | 'success' | 'error' = 'idle';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let composerRef: ReplyComposer | null = null;
  let extraReplies: Comment[] = [];
  let loadingMore = false;
  let loadError: string | null = null;
  let hasMore = comment.hasMoreChildren ?? false;
let moreCount = Math.max(
  comment.moreChildrenCount ?? 0,
  Math.max(0, (comment.reply_count ?? 0) - (comment.children?.length ?? 0))
);
let reportOpen = false;

  $: permalink = canonicalCommentPath(threadHandle, threadSlug, postId, comment.id);
  $: isHighlighted = highlightedId === comment.id;
  $: displayedChildren = [...(comment.children ?? []), ...extraReplies];

  async function handleCopy() {
    const ok = await copyToClipboard(permalink);
    copyStatus = ok ? 'success' : 'error';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus = 'idle';
    }, 2200);
  }

  function toggleReply() {
    replyOpen = !replyOpen;
    if (replyOpen) {
      queueMicrotask(() => composerRef?.focus());
    }
  }

  async function loadHiddenReplies() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    loadError = null;
    try {
      const res = await fetch(`/api/comments?replyTo=${comment.id}&mode=deep`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        devLog('[CommentItem] loadHiddenReplies failed', payload, { status: res.status });
        throw new Error(safeApiPayloadMessage(payload, res.status));
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      extraReplies = items.map((item: any) => ({
        id: item.id ?? item.comment_id,
        post_id: item.post_id ?? item.comment_post_id ?? comment.post_id,
        parent_id: item.parent_id ?? comment.id,
        body: item.body ?? '',
        created_at: item.created_at ?? new Date().toISOString(),
        author: {
          id: item.author?.id ?? item.author_id ?? 'unknown',
          display_name: item.author?.display_name ?? item.author_display_name ?? null,
          handle: item.author?.handle ?? item.author_handle ?? null,
          avatar_url: item.author?.avatar_url ?? item.author_avatar_url ?? null
        },
        reply_count: item.reply_count ?? 0,
        children: item.children ?? []
      }));
      hasMore = false;
      moreCount = extraReplies.length;
    } catch (err) {
      devLog('[CommentItem] loadHiddenReplies error', err);
      loadError = safeUiMessage(err);
    } finally {
      loadingMore = false;
    }
  }

  function handleCancel() {
    replyOpen = false;
  }

  function handleReactionChange(
    event: CustomEvent<{ counts: Comment['reactions']; states: Comment['reactionStates'] }>
  ) {
    const { counts, states } = event.detail;
    Object.assign(comment, {
      reactions: counts ?? { like: 0, cheer: 0, spark: 0 },
      reactionStates: states ?? { like: false, cheer: false, spark: false }
    });
    comment = { ...comment };
  }

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });

  const defaultCounts = { like: 0, cheer: 0, spark: 0 };
  const defaultStates = { like: false, cheer: false, spark: false };

  $: commentId = comment.id;
  $: reactionCounts = comment.reactions ?? defaultCounts;
  $: reactionStates = comment.reactionStates ?? defaultStates;
</script>

<article
  id={`c-${commentId}`}
  data-testid="comment-item"
  data-comment-id={commentId}
  data-testid-legacy={`comment-item-${commentId}`}
  class={`comment-card ${isHighlighted ? 'highlighted' : ''}`}
>
  <header class="comment-header">
    <img
      src={comment.author.avatar_url ?? '/avatar.svg'}
      alt=""
      width="40"
      height="40"
      class="avatar"
      loading="lazy"
    />
    <div class="meta">
      <div class="author-row">
        <span class="display-name">{comment.author.display_name ?? comment.author.handle ?? 'Someone'}</span>
        {#if comment.author.handle}
          <span class="handle">@{comment.author.handle}</span>
        {/if}
      </div>
      <time datetime={comment.created_at} class="timestamp">{relativeTime(comment.created_at)}</time>
    </div>
  </header>

  <div class="comment-body">
    <div class="formatted" data-testid={`comment-body-${comment.id}`}>
      {@html formatCommentBody(comment.body ?? '')}
    </div>
  </div>

  <div class="comment-actions">
    <div class="comment-actions__buttons">
      <button
        type="button"
        class="action-btn"
        data-testid={`reply-toggle-${commentId}`}
        on:click={toggleReply}
      >
        {replyOpen ? 'Cancel' : 'Reply'}
      </button>
      <button
        type="button"
        class="action-btn"
        data-testid={`copy-link-${commentId}`}
        on:click={handleCopy}
      >
        Copy link
      </button>
      <button type="button" class="action-btn" on:click={() => (reportOpen = true)}>
        Report
      </button>
      {#if copyStatus !== 'idle'}
        <span class={`copy-status ${copyStatus}`}>{copyStatus === 'success' ? 'Copied!' : 'Copy failed'}</span>
      {/if}
    </div>

    <ReactionBar
      target={{ type: 'comment', id: commentId }}
      counts={reactionCounts}
      states={reactionStates}
      on:change={handleReactionChange}
    />
  </div>

  {#if replyOpen}
    <div class="reply-slot" data-testid={`reply-slot-${comment.id}`}>
      <ReplyComposer
        bind:this={composerRef}
        parentId={comment.id}
        testId={`reply-composer-${comment.id}`}
        submitLabel="Reply"
        on:cancel={handleCancel}
        autofocus
      />
    </div>
  {/if}

  {#if displayedChildren.length > 0}
    <div class="child-thread">
      <CommentThread
        postId={postId}
        comments={displayedChildren}
        highlightedId={highlightedId}
        threadHandle={threadHandle}
        threadSlug={threadSlug}
        depth={depth + 1}
      />
    </div>
  {/if}

  {#if hasMore}
    <div class="show-more">
      <button
        type="button"
        class="show-more-btn"
        data-testid={`show-more-${comment.id}`}
        on:click={loadHiddenReplies}
        disabled={loadingMore}
      >
        {loadingMore ? 'Loading…' : `Show more replies (${moreCount ?? 0})`}
      </button>
    </div>
  {/if}

  {#if loadError}
    <p class="load-error" role="status">{loadError}</p>
  {/if}
  <ReportModal bind:open={reportOpen} targetKind="comment" targetId={commentId} />
</article>

<style>
  .comment-card {
    position: relative;
    padding: 18px 18px 18px 72px;
    border-radius: 20px;
    border: 1px solid rgba(51, 65, 85, 0.55);
    background: rgba(15, 23, 42, 0.55);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
  }

  .comment-card:focus-within {
    border-color: rgba(16, 185, 129, 0.55);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.22);
  }

  .highlighted {
    border-color: rgba(16, 185, 129, 0.7);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25), 0 18px 40px rgba(16, 185, 129, 0.18);
    animation: highlightPulse 1.4s ease-in-out 2;
  }

  @keyframes highlightPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.08);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.05);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .highlighted {
      animation: none;
    }
  }

  .comment-header {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 10px;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid rgba(148, 163, 184, 0.45);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .author-row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.95rem;
  }

  .display-name {
    font-weight: 600;
    color: #f1f5f9;
  }

  .handle {
    color: rgba(148, 163, 184, 0.85);
  }

  .timestamp {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .comment-body {
    font-size: 0.95rem;
    line-height: 1.65;
    color: #e2e8f0;
  }

  .formatted :global(a) {
    color: rgba(94, 234, 212, 0.85);
  }

  .formatted :global(a.mention) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(45, 212, 191, 0.14);
    color: rgba(94, 234, 212, 0.95);
    text-decoration: none;
    font-size: 0.85em;
  }

  .comment-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
    margin-top: 12px;
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .comment-actions__buttons {
    display: inline-flex;
    gap: 18px;
    align-items: center;
  }

  .comment-actions__buttons + :global(.reaction-bar) {
    margin-left: auto;
  }

  .action-btn {
    color: inherit;
    transition: color 0.16s ease;
  }

  .action-btn:hover,
  .action-btn:focus-visible {
    color: rgba(129, 231, 199, 0.95);
  }

  .copy-status {
    font-size: 0.75rem;
  }

  .copy-status.success {
    color: rgba(134, 239, 172, 0.95);
  }

  .copy-status.error {
    color: rgba(248, 113, 113, 0.95);
  }

  .reply-slot {
    margin-top: 16px;
  }

  .child-thread {
    margin-top: 18px;
  }

  .show-more {
    margin-top: 16px;
  }

  .show-more-btn {
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(71, 85, 105, 0.6);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(148, 163, 184, 0.9);
    transition: border-color 0.16s ease, color 0.16s ease;
  }

  .show-more-btn:hover,
  .show-more-btn:focus-visible {
    border-color: rgba(94, 234, 212, 0.8);
    color: rgba(148, 239, 203, 0.98);
  }

  .show-more-btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .load-error {
    margin-top: 10px;
    font-size: 0.78rem;
    color: rgba(248, 113, 113, 0.9);
  }

  @media (max-width: 640px) {
    .comment-card {
      padding: 16px 14px 16px 60px;
    }

    .comment-header {
      gap: 12px;
    }

    .avatar {
      width: 40px;
      height: 40px;
    }

    .comment-actions {
      gap: 12px;
    }

    .comment-actions__buttons {
      gap: 12px;
      flex-wrap: wrap;
    }
  }
</style>
