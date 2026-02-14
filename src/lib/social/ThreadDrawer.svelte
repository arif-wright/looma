<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import CommentComposer from './CommentComposer.svelte';
  import CommentItem from './CommentItem.svelte';
  import {
    fetchReplies,
    formatCommentBody,
    keyForCursor,
    normalizeComment,
    relativeTime,
    THREAD_DRAWER_PAGE_SIZE
  } from './commentHelpers';
  import { canonicalPostPath } from '$lib/threads/permalink';
  import type { CommentNode, PostComment } from './types';
  import AvatarImage from '$lib/components/ui/AvatarImage.svelte';

export let open = false;
export let postId: string;
export let threadSlug: string | null = null;
export let threadHandle: string | null = null;
export let root: CommentNode | null = null;
export let ancestors: CommentNode[] = [];
export let pageSize = THREAD_DRAWER_PAGE_SIZE;

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
  $: drawerThreadLink = canonicalPostPath(threadHandle, threadSlug, postId);

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

  function resetState(baseRoot: CommentNode | null, baseAncestors: CommentNode[]) {
    replies = [];
    cursor = null;
    hasMore = false;
    replyStates = new Map();
    commentLookup.clear();
    parentLookup.clear();
    rootTotalCount = baseRoot?.reply_count ?? 0;
    for (const ancestor of baseAncestors) {
      registerComment(ancestor);
    }
    if (baseRoot) {
      registerComment(baseRoot);
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
    const ordered = normalized.slice().reverse();
    if (initial) {
      replies = ordered;
    } else {
      replies = [...ordered, ...replies];
    }
    const lastRootReply = normalized.at(-1);
    cursor = lastRootReply ? keyForCursor(lastRootReply) : cursor;
    const expectedTotal = root?.reply_count ?? rootTotalCount ?? 0;
    rootTotalCount = Math.max(expectedTotal, replies.length);
    hasMore = replies.length < rootTotalCount || normalized.length === pageSize;
  }

  function insertReply(parentId: string | null, data: PostComment) {
    const node = normalizeComment(data);
    node.depth = 0;
    registerComment(node);

    if (root && parentId === root.comment_id) {
      replies = [...replies, node];
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
    state.items = [...state.items, node];
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

    const ordered = normalized.slice().reverse();

    state.items = append ? [...ordered, ...state.items] : ordered;
    const lastChildReply = normalized.at(-1);
    state.cursor = lastChildReply ? keyForCursor(lastChildReply) : state.cursor;
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
      resetState(root, ancestors);
      void loadRootReplies(true);
    }
  } else {
    lastRootId = null;
  }
</script>

{#if open && root}
  <div
    class="backdrop"
    role="button"
    tabindex="0"
    aria-label="Close thread"
    on:click={(event) => event.currentTarget === event.target && closeDrawer()}
    on:keydown={(event) => (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') && closeDrawer()}
  >
    <div class="drawer" role="dialog" aria-modal="true" tabindex="-1">
      <button type="button" class="close" on:click={closeDrawer} aria-label="Close thread">
        ✕
      </button>
      <header class="header">
        <h2>Thread</h2>
        <p class="subhead">
          {root.author_display_name ?? root.author_handle ?? 'Someone'} • {relativeTime(root.created_at)}
        </p>
        <a class="open-full" href={drawerThreadLink}>
          Open full thread
        </a>
      </header>

      <section class="root-card">
        <header class="root-meta">
          <div class="root-author">
            <span class="avatar">
              <AvatarImage
                src={root.author_avatar_url ?? '/avatar.svg'}
                name={root.author_display_name}
                handle={root.author_handle}
                alt=""
                width={32}
                height={32}
                className="thread-root-avatar"
                loading="lazy"
              />
            </span>
            <div>
              <strong>{root.author_display_name ?? root.author_handle ?? 'Someone'}</strong>
              <span class="root-time">{relativeTime(root.created_at)}</span>
            </div>
          </div>
        </header>
        <div class="root-body">
          {@html formatCommentBody(root.body)}
        </div>
      </section>

      {#if ancestors.length > 0}
        <section class="timeline" aria-label="Conversation context">
          {#each ancestors as ancestor}
            <div class="timeline-row">
              <div class="timeline-dot" aria-hidden="true"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-author">
                    {ancestor.author_display_name ?? ancestor.author_handle ?? 'Someone'}
                  </span>
                  <span class="timeline-time">{relativeTime(ancestor.created_at)}</span>
                </div>
                <div class="timeline-body">
                  {@html formatCommentBody(ancestor.body)}
                </div>
              </div>
            </div>
          {/each}
        </section>
      {/if}

      <section class="reply-list" aria-label="Thread replies">
        {#if replies.length === 0 && !hasMore && !loading}
          <p class="status empty">No replies yet. Be the first to respond.</p>
        {/if}
        {#if replies.length === 0 && loading}
          <p class="status">Loading replies…</p>
        {/if}
        <ul>
          {#each replies as reply (reply.comment_id)}
            <CommentItem
              postId={postId}
              threadHandle={threadHandle}
              threadSlug={threadSlug}
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
            {loading ? 'Loading…' : 'Load more replies'}
          </button>
        {/if}
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
    </div>
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
    overflow: hidden;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    gap: 16px;
    padding: 24px;
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
    gap: 4px;
  }

  .subhead {
    font-size: 0.82rem;
    opacity: 0.7;
  }

  .open-full {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: rgb(110 231 183);
    text-decoration: none;
  }

  .open-full:hover,
  .open-full:focus-visible {
    text-decoration: underline;
  }

  .root-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);
    display: grid;
    gap: 12px;
  }

  .root-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .root-author {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar {
    display: inline-flex;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  :global(.thread-root-avatar) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .root-time {
    font-size: 0.78rem;
    opacity: 0.7;
  }

  .root-body {
    font-size: 0.94rem;
    line-height: 1.45;
  }

  .timeline {
    position: relative;
    padding-left: 24px;
    display: grid;
    gap: 14px;
    max-height: 30vh;
    overflow-y: auto;
  }

  .timeline::before {
    content: '';
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 10px;
    width: 2px;
    background: rgba(255, 255, 255, 0.08);
  }

  .timeline-row {
    display: flex;
    gap: 12px;
  }

  .timeline-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    margin-top: 6px;
  }

  .timeline-content {
    display: grid;
    gap: 6px;
  }

  .timeline-header {
    display: flex;
    gap: 8px;
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .timeline-author {
    font-weight: 600;
  }

  .timeline-body {
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .reply-list {
    overflow-y: auto;
    padding-right: 6px;
  }

  .reply-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 18px;
  }

  .status {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }

  .status.empty {
    text-align: center;
    opacity: 0.6;
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

  .reply-composer {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 12px;
  }
</style>
