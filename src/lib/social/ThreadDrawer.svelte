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
  let rootTotalCount = 0;

  let replyStates = new Map<string, ReplyState>();
  const commentLookup = new Map<string, CommentNode>();
  const parentLookup = new Map<string, string | null>();
  let lastRootId: string | null = null;

  function closeDrawer() {
    dispatch('close');
  }

  function registerComment(comment: CommentNode) {
    commentLookup.set(comment.comment_id, comment);
    parentLookup.set(comment.comment_id, comment.parent_id ?? null);
  }

  function ensureReplyState(comment: CommentNode): ReplyState {
    const existing = replyStates.get(comment.comment_id);
    if (existing) return existing;
    const state: ReplyState = {
      items: [],
      hasMore: (comment.reply_count ?? 0) > 0,
      cursor: null,
      totalCount: comment.reply_count ?? 0,
      loading: false,
      isOpen: false
    };
    const next = new Map(replyStates);
    next.set(comment.comment_id, state);
    replyStates = next;
    return state;
  }

  function resetState(baseRoot: CommentNode | null) {
    replies = [];
    cursor = null;
    hasMore = false;
    replyStates = new Map();
    commentLookup.clear();
    parentLookup.clear();
    if (baseRoot) {
      registerComment(baseRoot);
      rootTotalCount = baseRoot.reply_count ?? 0;
    } else {
      rootTotalCount = 0;
    }
  }

  function buildAncestors(comment: CommentNode): CommentNode[] {
    const trail: CommentNode[] = [];
    let currentId = parentLookup.get(comment.comment_id) ?? comment.parent_id ?? null;
    while (currentId) {
      const node = commentLookup.get(currentId);
      if (!node) break;
      trail.unshift(node);
      currentId = parentLookup.get(node.comment_id) ?? node.parent_id ?? null;
    }
    return trail;
  }

  async function loadRootReplies(initial = false) {
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
      registerComment(node);
      return node;
    });
    replies = initial ? normalized : [...replies, ...normalized];
    cursor = normalized.length > 0 ? keyForCursor(normalized[normalized.length - 1]) : cursor;
    rootTotalCount = Math.max(rootTotalCount, replies.length);
    hasMore = replies.length < rootTotalCount || normalized.length === pageSize;
  }

  function insertReply(parentId: string | null, data: PostComment) {
    const node = normalizeComment(data);
    node.depth = 0;
    registerComment(node);

    if (root && parentId === root.comment_id) {
      replies = [node, ...replies];
      rootTotalCount += 1;
      hasMore = replies.length < rootTotalCount;
      return;
    }

    if (!parentId) {
      replies = [node, ...replies];
      rootTotalCount += 1;
      hasMore = replies.length < rootTotalCount;
      return;
    }

    const parent = commentLookup.get(parentId);
    if (!parent) return;
    const state = ensureReplyState(parent);
    state.items = [node, ...state.items];
    state.totalCount = state.totalCount + 1;
    state.hasMore = state.items.length < state.totalCount;
    replyStates = new Map(replyStates);
  }

  function handleReplyPosted(event: CustomEvent<{ comment: PostComment; parentId: string | null }>) {
    const reply = event.detail.comment;
    if (!reply) return;
    insertReply(event.detail.parentId ?? null, reply);
  }

  function handleReplyCount(event: CustomEvent<{ parentId: string; total: number }>) {
    const { parentId, total } = event.detail;
    if (!parentId) return;
    if (root && parentId === root.comment_id) {
      rootTotalCount = total;
      hasMore = replies.length < rootTotalCount;
      return;
    }
    const parent = commentLookup.get(parentId);
    if (!parent) return;
    const state = ensureReplyState(parent);
    state.totalCount = total;
    state.hasMore = state.items.length < state.totalCount;
    replyStates = new Map(replyStates);
  }

  async function loadChildReplies(comment: CommentNode, append = true) {
    const state = ensureReplyState(comment);
    if (state.loading) return;
    state.loading = true;
    replyStates = new Map(replyStates);

    const { items, error } = await fetchReplies(comment.comment_id, {
      limit: pageSize,
      after: append ? state.cursor : null
    });

    if (error) {
      state.loading = false;
      replyStates = new Map(replyStates);
      return;
    }

    const normalized = (items ?? []).map((row) => {
      const node = normalizeComment(row);
      node.depth = 0;
      registerComment(node);
      return node;
    });

    state.items = append ? [...state.items, ...normalized] : normalized;
    state.cursor = normalized.length > 0 ? keyForCursor(normalized[normalized.length - 1]) : state.cursor;
    const expectedTotal = comment.reply_count ?? state.totalCount;
    state.totalCount = Math.max(expectedTotal, state.items.length);
    state.hasMore = state.items.length < state.totalCount || normalized.length === pageSize;
    state.loading = false;
    replyStates = new Map(replyStates);
  }

  function handleToggleReplies(event: CustomEvent<{ comment: CommentNode }>) {
    const comment = event.detail.comment;
    const state = ensureReplyState(comment);
    state.isOpen = !state.isOpen;
    replyStates = new Map(replyStates);
    if (state.isOpen && state.items.length === 0 && state.hasMore && !state.loading) {
      void loadChildReplies(comment, false);
    }
  }

  function handleLoadReplies(event: CustomEvent<{ comment: CommentNode; append?: boolean }>) {
    void loadChildReplies(event.detail.comment, event.detail.append ?? true);
  }

  function handleContinueThread(event: CustomEvent<{ comment: CommentNode }>) {
    const target = event.detail.comment;
    if (!target) return;
    root = target;
    ancestors = buildAncestors(target);
    lastRootId = null;
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
      resetState(root);
      void loadRootReplies(true);
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
              on:replyPosted={handleReplyPosted}
              on:replyCount={handleReplyCount}
              on:toggleReplies={handleToggleReplies}
              on:loadReplies={handleLoadReplies}
              on:continueThread={handleContinueThread}
            />
          {/each}
        </ul>
        {#if hasMore}
          <button type="button" class="load-more" on:click={() => loadRootReplies(false)} disabled={loading}>
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
