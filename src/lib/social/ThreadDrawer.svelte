<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import CommentComposer from './CommentComposer.svelte';
  import CommentItem from './CommentItem.svelte';
  import {
    fetchReplies,
    formatCommentBody,
    keyForCursor,
    normalizeComment,
    relativeTime
  } from './commentHelpers';
  import type { CommentNode, PostComment } from './types';

  export let open = false;
  export let postId: string;
  export let root: CommentNode | null = null;
  export let ancestors: CommentNode[] = [];
  export let pageSize = 20;

  type ReplyState = {
    items: CommentNode[];
    hasMore: boolean;
    cursor: string | null;
    totalCount: number;
    loading: boolean;
    isOpen: boolean;
  };

  const dispatch = createEventDispatcher<{ close: void }>();

  let replies: CommentNode[] = [];
  let cursor: string | null = null;
  let loading = false;
  let hasMore = false;
  let composerRef: InstanceType<typeof CommentComposer> | null = null;
  let replyStates = new Map<string, ReplyState>();
  let lastRootId: string | null = null;

  function closeDrawer() {
    dispatch('close');
  }

  function resetState() {
    replies = [];
    cursor = null;
    hasMore = false;
    replyStates = new Map();
  }

  async function loadReplies(initial = false) {
    if (!root || loading) return;
    loading = true;
    const { items, error } = await fetchReplies(root.comment_id, {
      limit: pageSize,
      after: initial ? null : cursor
    });
    loading = false;
    if (error) return;
    const normalized = (items ?? []).map((row) => {
      const node = normalizeComment(row);
      node.depth = 0;
      return node;
    });
    replies = initial ? normalized : [...replies, ...normalized];
    cursor = normalized.length > 0 ? keyForCursor(normalized[normalized.length - 1]) : cursor;
    hasMore = normalized.length === pageSize;
  }

  function handleReplyPosted(event: CustomEvent<{ comment: PostComment; parentId: string | null }>) {
    const reply = event.detail.comment;
    if (!reply) return;
    const node = normalizeComment(reply);
    node.depth = 0;
    replies = [node, ...replies];
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  $: if (open) {
    const currentId = root?.comment_id ?? null;
    if (currentId && currentId !== lastRootId) {
      lastRootId = currentId;
      resetState();
      void loadReplies(true);
    }
  } else {
    lastRootId = null;
  }
</script>

{#if open && root}
  <div class="backdrop" on:click={closeDrawer}>
    <aside class="drawer" role="dialog" aria-modal="true" on:click|stopPropagation>
      <button type="button" class="close" on:click={closeDrawer} aria-label="Close thread">
        ✕
      </button>
      <header class="header">
        <h2>Thread</h2>
        {#if ancestors.length > 0}
          <nav class="trail" aria-label="Ancestor comments">
            {#each ancestors as ancestor, index}
              <span class="trail-item">
                {ancestor.author_display_name ?? ancestor.author_handle ?? 'Someone'}
                <span aria-hidden="true">•</span>
                {relativeTime(ancestor.created_at)}
              </span>
              {#if index < ancestors.length - 1}
                <span class="trail-separator">›</span>
              {/if}
            {/each}
          </nav>
        {/if}
      </header>

      <section class="root">
        <header>
          <strong>{root.author_display_name ?? root.author_handle ?? 'Someone'}</strong>
          <span class="root-meta">{relativeTime(root.created_at)}</span>
        </header>
        <p>{@html formatCommentBody(root.body)}</p>
      </section>

      <section class="reply-composer">
        <CommentComposer
          bind:this={composerRef}
          postId={postId}
          parentId={root.comment_id}
          placeholder={`Reply to ${
            root.author_display_name ?? root.author_handle ?? 'this thread'
          }…`}
          on:posted={handleReplyPosted}
        />
      </section>

      <section class="reply-list" aria-label="Thread replies">
        {#if replies.length === 0 && loading}
          <p class="status">Loading replies…</p>
        {/if}
        <ul>
          {#each replies as reply (reply.comment_id)}
            <CommentItem
              postId={postId}
              {replyStates}
              comment={reply}
              replyPageSize={pageSize}
              maxDepth={0}
              on:replyPosted={(event) => handleReplyPosted(event)}
            />
          {/each}
        </ul>
        {#if hasMore}
          <button type="button" class="load-more" on:click={() => loadReplies(false)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        {/if}
      </section>
    </aside>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 10, 0.75);
    display: flex;
    justify-content: flex-end;
    z-index: 90;
  }

  .drawer {
    position: relative;
    background: rgba(18, 18, 24, 0.96);
    width: min(520px, 100vw);
    height: 100vh;
    padding: 24px;
    overflow-y: auto;
    display: grid;
    gap: 18px;
  }

  @media (max-width: 640px) {
    .drawer {
      width: 100vw;
    }
  }

  .close {
    position: absolute;
    top: 16px;
    right: 16px;
    border: none;
    background: none;
    font-size: 1.2rem;
    color: inherit;
    cursor: pointer;
  }

  .header {
    display: grid;
    gap: 8px;
  }

  .trail {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .trail-item span {
    margin: 0 4px;
    opacity: 0.5;
  }

  .root {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    display: grid;
    gap: 6px;
  }

  .root header {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
    opacity: 0.85;
  }

  .root-meta {
    font-size: 0.76rem;
  }

  .reply-composer {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 12px;
  }

  .reply-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
  }

  .load-more {
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .status {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }
</style>
