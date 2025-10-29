<script lang="ts">
  import CommentItem from './CommentItem.svelte';
  import type { Comment } from '$lib/threads/types';

  export let postId: string;
  export let comments: Comment[] = [];
  export let highlightedId: string | null = null;
  export let threadHandle: string | null = null;
  export let threadSlug: string | null = null;
  export let depth = 0;
  export let testId = depth === 0 ? 'comment-thread-root' : 'comment-thread-nested';
</script>

{#if comments.length === 0 && depth === 0}
  <p class="empty" data-testid="comment-thread-empty">
    No replies yet. Start the conversation!
  </p>
{:else if comments.length > 0}
  <ul class={`thread depth-${depth}`} data-testid={testId}>
    {#each comments as comment (comment.id)}
      <li class="thread-item" data-testid={`comment-node-${comment.id}`}>
        <CommentItem
          {comment}
          {postId}
          {threadHandle}
          {threadSlug}
          {highlightedId}
          depth={depth}
        />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    padding: 24px;
    border-radius: 16px;
    border: 1px solid rgba(51, 65, 85, 0.55);
    background: rgba(15, 23, 42, 0.65);
    text-align: center;
    font-size: 0.9rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .thread {
    display: grid;
    gap: 16px;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .thread-item {
    list-style: none;
  }

  .depth-1 {
    padding-left: 20px;
  }

  .depth-2 {
    padding-left: 32px;
  }

  .depth-3 {
    padding-left: 40px;
  }

  @media (max-width: 640px) {
    .depth-1 {
      padding-left: 16px;
    }

    .depth-2 {
      padding-left: 20px;
    }

    .depth-3 {
      padding-left: 24px;
    }
  }
</style>
