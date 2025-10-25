<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CommentComposer from './CommentComposer.svelte';
  import { fetchReplies, formatCommentBody, mergeReplies, normalizeComment, relativeTime } from './commentHelpers';
  import type { CommentNode, PostComment } from './types';

  const REPLY_PAGE_SIZE = 5;

  export let postId: string;
  export let comment: CommentNode;
  export let depth = 0;

  const dispatch = createEventDispatcher<{
    replyPosted: { parentId: string; comment: PostComment };
    replyCount: { parentId: string; total: number };
  }>();

  const indent = Math.min(depth, 4) * 16;

  let composerRef: InstanceType<typeof CommentComposer> | null = null;

  $: replies = comment.replies ?? [];
  $: totalReplies = comment.repliesTotal ?? comment.reply_count ?? 0;
  $: visibleReplies = replies.length;
  $: remainingReplies = Math.max(0, totalReplies - visibleReplies);

  async function loadReplies(append = false) {
    if (comment.repliesLoading) return;
    comment.repliesLoading = true;
    comment.repliesError = null;
    const cursor =
      append && comment.replies && comment.replies.length > 0
        ? (comment.replies[0].created_at as string)
        : null;
    const { items, error } = await fetchReplies(comment.id, {
      limit: REPLY_PAGE_SIZE,
      after: append ? cursor : null
    });

    if (error) {
      comment.repliesError = error;
      comment.repliesLoading = false;
      return;
    }

    const normalized = items.map(normalizeComment);
    comment.replies = mergeReplies(append ? comment.replies ?? [] : [], normalized);
    comment.repliesTotal = Math.max(comment.repliesTotal ?? comment.reply_count ?? 0, comment.replies.length);
    comment.repliesCursor =
      items.length === REPLY_PAGE_SIZE && comment.replies.length > 0
        ? (comment.replies[0].created_at as string)
        : null;
    comment.repliesLoading = false;
  }

  function toggleReplyComposer() {
    comment.replying = !comment.replying;
    if (comment.replying) {
      composerRef?.focus();
    }
  }

  async function toggleReplies() {
    comment.repliesVisible = !comment.repliesVisible;
    if (comment.repliesVisible && (comment.replies?.length ?? 0) === 0 && (comment.reply_count ?? 0) > 0) {
      await loadReplies(false);
    }
  }

  async function loadMoreReplies() {
    await loadReplies(true);
  }

  function handleReplyPosted(event: CustomEvent<{ comment: PostComment; parentId: string | null }>) {
    const reply = event.detail.comment;
    if (!reply) return;
    comment.replying = false;
    comment.repliesVisible = true;
    comment.replies = mergeReplies(comment.replies ?? [], [normalizeComment(reply)]);
    comment.reply_count = (comment.reply_count ?? 0) + 1;
    comment.repliesTotal = Math.max(comment.repliesTotal ?? 0, comment.reply_count);
    dispatch('replyPosted', { parentId: comment.id, comment: reply });
    dispatch('replyCount', { parentId: comment.id, total: comment.repliesTotal ?? comment.reply_count ?? 0 });
  }
</script>

<li class="comment" id={`comment-${comment.id}`} style={`margin-left:${indent}px`}>
  <img class="avatar" src={comment.avatar_url ?? '/avatar.svg'} alt="" width="32" height="32" loading="lazy" />
  <div class="content">
    <div class="header">
      <a class="name" href={`/u/${comment.handle ?? comment.author_id}`}>
        {comment.display_name ?? (comment.handle ? `@${comment.handle}` : 'Someone')}
      </a>
      <span class="dot" aria-hidden="true">•</span>
      <span class="when">{relativeTime(comment.created_at)}</span>
    </div>
    <p class="body">
      {@html formatCommentBody(comment.body)}
    </p>
    <div class="actions">
      <button type="button" class="action">Like</button>
      <button type="button" class="action" on:click={toggleReplyComposer}>
        {comment.replying ? 'Cancel' : 'Reply'}
      </button>
      {#if comment.reply_count > 0}
        <button type="button" class="action" on:click={toggleReplies}>
          {#if comment.repliesVisible}
            Hide replies
          {:else if remainingReplies > 0}
            View {remainingReplies} more replies
          {:else}
            View replies
          {/if}
        </button>
      {/if}
    </div>

    {#if comment.replying}
      <div class="reply-composer">
        <CommentComposer
          bind:this={composerRef}
          postId={postId}
          parentId={comment.id}
          placeholder={`Reply to ${comment.display_name ?? comment.handle ?? 'this comment'}…`}
          on:posted={handleReplyPosted}
        />
      </div>
    {/if}

    {#if comment.repliesVisible}
      <div class="replies">
        {#if comment.repliesError}
          <p class="status error">{comment.repliesError}</p>
        {/if}
        {#if comment.repliesLoading && (comment.replies?.length ?? 0) === 0}
          <p class="status">Loading replies…</p>
        {/if}
        {#if comment.replies && comment.replies.length > 0}
          <ul class="reply-list">
            {#each comment.replies as reply (reply.id)}
              <svelte:self
                postId={postId}
                comment={reply}
                depth={depth + 1}
                on:replyPosted={(event) => dispatch('replyPosted', event.detail)}
                on:replyCount={(event) => dispatch('replyCount', event.detail)}
              />
            {/each}
          </ul>
        {/if}
        {#if comment.repliesCursor}
          <button class="more" type="button" on:click={loadMoreReplies} disabled={comment.repliesLoading}>
            {comment.repliesLoading ? 'Loading…' : 'View older replies'}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</li>

<style>
  .comment {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 10px;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.05);
  }

  .content {
    display: grid;
    gap: 6px;
  }

  .header {
    display: flex;
    gap: 6px;
    align-items: baseline;
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

  .when {
    font-size: 0.72rem;
  }

  .body {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.35;
    word-break: break-word;
  }

  :global(.mention) {
    color: inherit;
    font-weight: 600;
    text-decoration: none;
  }

  :global(.mention:hover),
  :global(.mention:focus-visible) {
    text-decoration: underline;
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
    margin-top: 6px;
  }

  .replies {
    margin-top: 8px;
    padding-left: 18px;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
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

  .status {
    margin: 0;
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .status.error {
    color: #fca5a5;
    opacity: 1;
  }

  .more {
    justify-self: flex-start;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .more:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
