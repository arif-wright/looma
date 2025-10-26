<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CommentComposer from './CommentComposer.svelte';
  import { formatCommentBody, remainingRepliesText, relativeTime } from './commentHelpers';
  import type { CommentNode, PostComment } from './types';

  type ReplyState = {
    items: CommentNode[];
    hasMore: boolean;
    cursor: string | null;
    totalCount: number;
    loading: boolean;
    isOpen: boolean;
  };

  export let postId: string;
  export let comment: CommentNode;
  export let replyStates: Map<string, ReplyState>;
  export let replyPageSize: number;
  export let maxDepth: number;

  const dispatch = createEventDispatcher<{
    replyPosted: { parentId: string; comment: PostComment };
    replyCount: { parentId: string; total: number };
    toggleReplies: { comment: CommentNode };
    loadReplies: { comment: CommentNode; append?: boolean };
    continueThread: { comment: CommentNode };
  }>();

  let composerRef: InstanceType<typeof CommentComposer> | null = null;
  let seeMore = false;

  $: depth = comment.depth ?? 0;
  $: displayDepth = Math.min(depth, maxDepth);
  $: replyState = replyStates.get(comment.comment_id);
  $: replies = replyState?.items ?? [];
  $: totalCount = replyState ? replyState.totalCount : comment.reply_count ?? 0;
  $: hasReplies = totalCount > 0 || (replyState?.hasMore ?? false);
  $: isExpanded = replyState?.isOpen ?? false;
  $: estimatedRemaining = totalCount - replies.length;
  $: remaining =
    (replyState?.hasMore && estimatedRemaining <= 0
      ? replyPageSize
      : Math.max(estimatedRemaining, 0));
  $: continueThread = depth > maxDepth;
  $: bodyClamped = depth >= 1 && !seeMore;
  $: indentStyle = `--depth:${displayDepth}`;

  function toggleComposer() {
    comment.replying = !comment.replying;
    if (comment.replying) {
      composerRef?.focus();
    }
  }

  function toggleReplies() {
    dispatch('toggleReplies', { comment });
  }

  function loadMoreReplies() {
    dispatch('loadReplies', { comment, append: true });
  }

  function hydrateReplies() {
    dispatch('loadReplies', { comment, append: false });
  }

  function handleReplyPosted(event: CustomEvent<{ comment: PostComment; parentId: string | null }>) {
    const reply = event.detail.comment;
    if (!reply) return;
    comment.replying = false;
    dispatch('replyPosted', { parentId: comment.comment_id, comment: reply });
  }

  function handleSeeMoreToggle() {
    seeMore = !seeMore;
  }

  function handleContinueThread() {
    dispatch('continueThread', { comment });
  }
</script>

{#if continueThread}
  <li class="thread-pill" style={indentStyle}>
    <button
      type="button"
      class="pill-button"
      on:click={handleContinueThread}
      aria-haspopup="dialog"
    >
      Continue thread ({(replyState?.totalCount ?? comment.reply_count ?? 0) + 1})
    </button>
  </li>
{:else}
  <li
    class="comment"
    id={`comment-${comment.comment_id}`}
    style={indentStyle}
    data-depth={displayDepth}
  >
    <div class="guide" aria-hidden="true"></div>
    <img
      class:avatar-inline={depth === 0}
      class:avatar-reply={depth >= 1}
      src={comment.author_avatar_url ?? '/avatar.svg'}
      alt=""
      width={depth === 0 ? 32 : 24}
      height={depth === 0 ? 32 : 24}
      loading="lazy"
    />
    <div class="content">
      <header class="meta">
        <a class="name" href={`/u/${comment.author_handle ?? comment.author_id}`}>
          {comment.author_display_name ?? (comment.author_handle ? `@${comment.author_handle}` : 'Someone')}
        </a>
        <span class="dot" aria-hidden="true">•</span>
        <span class="timestamp">{relativeTime(comment.created_at)}</span>
      </header>
      <div class:body-clamped={bodyClamped} class="body">
        {@html formatCommentBody(comment.body)}
      </div>
      {#if depth >= 1 && comment.body?.length > 0}
        <button
          type="button"
          class="see-more"
          on:click={handleSeeMoreToggle}
          aria-expanded={seeMore}
        >
          {seeMore ? 'See less' : 'See more'}
        </button>
      {/if}
      <div class="actions">
        <button type="button" class="action">Like</button>
        <button type="button" class="action" on:click={toggleComposer}>
          {comment.replying ? 'Cancel' : 'Reply'}
        </button>
        {#if hasReplies}
          <button
            type="button"
            class="action"
            on:click={() => {
              if (!isExpanded && (replyState?.items.length ?? 0) === 0) {
                hydrateReplies();
              }
              toggleReplies();
            }}
            aria-expanded={isExpanded}
            aria-controls={`replies-${comment.comment_id}`}
          >
            {isExpanded ? 'Hide replies' : 'Show replies'}
          </button>
        {/if}
      </div>
      {#if comment.replying}
        <div class="reply-composer">
          <CommentComposer
            bind:this={composerRef}
            postId={postId}
            parentId={comment.comment_id}
            placeholder={`Reply to ${
              comment.author_display_name ?? comment.author_handle ?? 'this comment'
            }…`}
            on:posted={handleReplyPosted}
          />
        </div>
      {/if}

      {#if hasReplies && isExpanded}
        <div class="replies" id={`replies-${comment.comment_id}`}>
          {#if replyState?.loading && replies.length === 0}
            <p class="status">Loading replies…</p>
          {/if}
          <ul class="reply-list" role="list">
            {#each replies as reply (reply.comment_id)}
              <CommentItem
                postId={postId}
                comment={reply}
                {replyStates}
                {replyPageSize}
                {maxDepth}
                on:replyPosted={(event) => dispatch('replyPosted', event.detail)}
                on:replyCount={(event) => dispatch('replyCount', event.detail)}
                on:toggleReplies={(event) => dispatch('toggleReplies', event.detail)}
                on:loadReplies={(event) => dispatch('loadReplies', event.detail)}
                on:continueThread={(event) => dispatch('continueThread', event.detail)}
              />
            {/each}
          </ul>
          {#if remaining > 0}
          <button
            type="button"
            class="more"
            on:click={loadMoreReplies}
            disabled={replyState?.loading}
            aria-expanded="true"
          >
              {remainingRepliesText(remaining, replyPageSize)}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </li>
{/if}

<style>
  :global(:root) {
    --comment-indent: 12px;
  }

  .comment {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    padding-left: calc(var(--depth) * var(--comment-indent));
  }

  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc((var(--depth)) * var(--comment-indent) - 8px);
    width: 1px;
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  .comment[data-depth='0'] .guide {
    display: none;
  }

  .thread-pill {
    display: flex;
    justify-content: flex-start;
    padding-left: calc(var(--depth) * var(--comment-indent));
  }

  .pill-button {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.78rem;
    color: inherit;
    cursor: pointer;
  }

  .pill-button:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: 2px;
  }

  .avatar-inline {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
  }

  .avatar-reply {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    object-fit: cover;
  }

  .content {
    display: grid;
    gap: 6px;
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .name {
    font-weight: 600;
    color: inherit;
    text-decoration: none;
  }

  .name:hover,
  .name:focus-visible {
    text-decoration: underline;
  }

  .timestamp {
    font-size: 0.72rem;
  }

  .dot {
    opacity: 0.5;
  }

  .body {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .body-clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;
    overflow: hidden;
  }

  .see-more {
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    align-self: flex-start;
  }

  .actions {
    display: flex;
    gap: 12px;
    font-size: 0.76rem;
  }

  .action {
    border: none;
    background: none;
    color: inherit;
    opacity: 0.75;
    cursor: pointer;
    padding: 0;
  }

  .action:hover,
  .action:focus-visible {
    opacity: 1;
    text-decoration: underline;
  }

  .reply-composer {
    margin-top: 8px;
  }

  .replies {
    margin-top: 8px;
    display: grid;
    gap: 10px;
  }

  .reply-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  .more {
    justify-self: flex-start;
    border: none;
    background: none;
    color: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    opacity: 0.8;
  }

  .more:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .status {
    font-size: 0.76rem;
    margin: 0;
    opacity: 0.75;
  }
</style>
