<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentComposer from './CommentComposer.svelte';
  import CommentItem from './CommentItem.svelte';
  import {
    fetchPostComments,
    fetchReplies,
    keyForCursor,
    normalizeComment,
    INLINE_REPLY_BATCH_SIZE,
    MAX_INLINE_DEPTH
  } from './commentHelpers';
  import type { CommentNode, PostComment } from './types';

  export let postId: string;
  export let pageSize = 10;
  export let initialCount = 0;
  export let initialItems: PostComment[] = [];
  export let initialCursor: string | null = null;
  export let threadHandle: string | null = null;
  export let threadSlug: string | null = null;

  type ReplyState = {
    items: CommentNode[];
    hasMore: boolean;
    cursor: string | null;
    totalCount: number;
    loading: boolean;
    isOpen: boolean;
  };

  const dispatch = createEventDispatcher<{
    count: number;
    openThread: { root: CommentNode; ancestors: CommentNode[] };
  }>();

  const supabaseClient = typeof window === 'undefined' ? null : supabaseBrowser();
  type SupabaseClient = NonNullable<typeof supabaseClient>;
  type SupabaseChannel = ReturnType<SupabaseClient['channel']>;
  const supabase = supabaseClient;

  let comments: CommentNode[] = [];
  let loading = false;
  let moreLoading = false;
  let errorMsg: string | null = null;
  let nextCursor: string | null = null;
  let totalCount = initialCount;
  let composerRef: InstanceType<typeof CommentComposer> | null = null;
  let channel: SupabaseChannel | null = null;
  let seeded = false;

  let replyStates = new Map<string, ReplyState>();
  const commentLookup = new Map<string, CommentNode>();
  const parentLookup = new Map<string, string | null>();
  const pendingIds = new Set<string>();

  function registerComment(comment: CommentNode) {
    commentLookup.set(comment.comment_id, comment);
    parentLookup.set(comment.comment_id, comment.parent_id ?? null);
  }

  function unregisterComment(commentId: string) {
    commentLookup.delete(commentId);
    parentLookup.delete(commentId);
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
      isOpen: comment.depth < MAX_INLINE_DEPTH && (comment.reply_count ?? 0) > 0
    };
    const next = new Map(replyStates);
    next.set(comment.comment_id, state);
    replyStates = next;
    return state;
  }

  async function loadRepliesForComment(comment: CommentNode, append = true) {
    const state = ensureReplyState(comment);
    if (state.loading) return;
    const after = append ? state.cursor : null;
    state.loading = true;
    replyStates = new Map(replyStates);

    const { items: rawItems, error } = await fetchReplies(comment.comment_id, {
      limit: INLINE_REPLY_BATCH_SIZE,
      after
    });

    if (error) {
      state.loading = false;
      replyStates = new Map(replyStates);
      errorMsg = error;
      return;
    }

    const normalized = (rawItems ?? []).map((row) => {
      const node = normalizeComment(row);
      node.depth = (comment.depth ?? 0) + 1;
      registerComment(node);
      return node;
    });

    state.items = append ? [...state.items, ...normalized] : normalized;
    state.cursor = normalized.length > 0 ? keyForCursor(normalized[normalized.length - 1]) : state.cursor;
    const expectedTotal = comment.reply_count ?? state.totalCount;
    state.totalCount = Math.max(expectedTotal, state.items.length);
    state.hasMore =
      state.items.length < state.totalCount ||
      normalized.length === INLINE_REPLY_BATCH_SIZE;
    state.loading = false;
    replyStates = new Map(replyStates);
    errorMsg = null;
  }

  function initializeReplyPreview(comment: CommentNode) {
    const state = ensureReplyState(comment);
    if (state.isOpen && state.items.length === 0 && state.hasMore && !state.loading) {
      void loadRepliesForComment(comment, false);
    }
  }

  function toggleReplies(comment: CommentNode) {
    const state = ensureReplyState(comment);
    state.isOpen = !state.isOpen;
    replyStates = new Map(replyStates);
    if (state.isOpen && state.items.length === 0 && state.hasMore && !state.loading) {
      void loadRepliesForComment(comment, false);
    }
  }

  function buildAncestorTrail(comment: CommentNode): CommentNode[] {
    const ancestors: CommentNode[] = [];
    let currentId = parentLookup.get(comment.comment_id) ?? comment.parent_id ?? null;
    while (currentId) {
      const parent = commentLookup.get(currentId);
      if (!parent) break;
      ancestors.unshift(parent);
      currentId = parentLookup.get(parent.comment_id) ?? parent.parent_id ?? null;
    }
    return ancestors;
  }

  function openThread(comment: CommentNode) {
    const ancestors = buildAncestorTrail(comment);
    dispatch('openThread', { root: comment, ancestors });
  }

  function registerPending(id: string) {
    pendingIds.add(id);
    setTimeout(() => pendingIds.delete(id), 1500);
  }

  async function fetchTopLevel(initial = false) {
    if (initial) {
      loading = true;
      errorMsg = null;
    } else if (!nextCursor || moreLoading) {
      return;
    } else {
      moreLoading = true;
    }

    const cursor = initial ? new Date().toISOString() : nextCursor;
    if (!initial && !cursor) {
      moreLoading = false;
      return;
    }

    const { items: rawItems, error } = await fetchPostComments(postId, {
      limit: pageSize,
      before: cursor ?? new Date().toISOString()
    });

    if (error) {
      errorMsg = error;
    } else {
      const normalized = rawItems.map((row) => {
        const node = normalizeComment(row);
        node.depth = 0;
        return node;
      });

      if (initial) {
        comments = normalized;
      } else {
        const map = new Map<string, CommentNode>();
        for (const existing of comments) {
          map.set(existing.comment_id, existing);
        }
        for (const node of normalized) {
          map.set(node.comment_id, node);
        }
        comments = Array.from(map.values()).sort((a, b) => {
          return Number(new Date(b.created_at)) - Number(new Date(a.created_at));
        });
      }

      comments = comments.map((comment) => {
        const next = { ...comment, depth: 0 };
        registerComment(next);
        return next;
      });

      if (initial && totalCount === 0) {
        totalCount = Math.max(totalCount, rawItems.length);
      }

      for (const comment of comments) {
        initializeReplyPreview(comment);
      }

      const last = rawItems.length > 0 ? rawItems[rawItems.length - 1] : null;
      nextCursor =
        rawItems.length === pageSize && last?.created_at
          ? (last.created_at as string)
          : null;
    }

    if (initial) {
      loading = false;
    } else {
      moreLoading = false;
    }
  }

  async function loadMoreTopLevel() {
    await fetchTopLevel(false);
  }

  function addTopLevel(comment: PostComment, optimistic = false) {
    const node = normalizeComment(comment);
    node.depth = 0;
    registerComment(node);
    comments = [node, ...comments.filter((existing) => existing.comment_id !== node.comment_id)];
    comments.sort((a, b) => Number(new Date(b.created_at)) - Number(new Date(a.created_at)));
    ensureReplyState(node);
    initializeReplyPreview(node);
    if (optimistic) registerPending(node.comment_id);
  }

  function addReply(parentId: string, reply: PostComment) {
    const parent = commentLookup.get(parentId);
    if (!parent) return;
    const node = normalizeComment(reply);
    node.depth = (parent.depth ?? 0) + 1;
    registerComment(node);
    const state = ensureReplyState(parent);
    state.items = [node, ...state.items];
    state.totalCount = state.totalCount + 1;
    state.hasMore = state.items.length < state.totalCount;
    replyStates = new Map(replyStates);
    parent.reply_count = (parent.reply_count ?? 0) + 1;
  }

  function updateReplyCount(parentId: string, total: number) {
    const parent = commentLookup.get(parentId);
    if (!parent) return;
    const state = ensureReplyState(parent);
    state.totalCount = total;
    state.hasMore = state.items.length < state.totalCount;
    replyStates = new Map(replyStates);
    parent.reply_count = total;
  }

  async function handleTopLevelPosted(event: CustomEvent<{ comment?: PostComment; parentId: string | null }>) {
    const comment = event.detail?.comment;
    if (!comment) {
      errorMsg = 'Failed to publish comment.';
      return;
    }
    errorMsg = null;
    addTopLevel(comment, true);
    totalCount += 1;
  }

  function handleReplyPosted(event: CustomEvent<{ parentId?: string; comment?: PostComment }>) {
    event.stopPropagation();
    const parentId = event.detail?.parentId;
    const reply = event.detail?.comment;
    if (!parentId || !reply) return;
    addReply(parentId, reply);
    totalCount += 1;
  }

  function handleReplyCount(event: CustomEvent<{ parentId: string; total: number }>) {
    const { parentId, total } = event.detail;
    updateReplyCount(parentId, total);
  }

  function handleToggleReplies(event: CustomEvent<{ comment: CommentNode }>) {
    event.stopPropagation();
    toggleReplies(event.detail.comment);
  }

  function handleLoadReplies(event: CustomEvent<{ comment: CommentNode; append?: boolean }>) {
    event.stopPropagation();
    void loadRepliesForComment(event.detail.comment, event.detail.append ?? true);
  }

  function handleContinueThread(event: CustomEvent<{ comment: CommentNode }>) {
    event.stopPropagation();
    openThread(event.detail.comment);
  }

  function pruneComment(commentId: string) {
    const parentId = parentLookup.get(commentId);
    unregisterComment(commentId);
    if (!parentId) {
      comments = comments.filter((comment) => comment.comment_id !== commentId);
      totalCount = Math.max(0, totalCount - 1);
      return;
    }
    const parent = commentLookup.get(parentId);
    if (!parent) return;
    const state = ensureReplyState(parent);
    state.items = state.items.filter((child) => child.comment_id !== commentId);
    state.totalCount = Math.max(0, state.totalCount - 1);
    state.hasMore = state.items.length < state.totalCount;
    replyStates = new Map(replyStates);
    totalCount = Math.max(0, totalCount - 1);
    parent.reply_count = Math.max(0, (parent.reply_count ?? state.totalCount) - 1);
  }

  async function hydrateComment(row: any): Promise<PostComment | null> {
    if (!row?.id) return null;
    const commentId = row.id ?? row.comment_id ?? null;
    if (!commentId) return null;

    const commentPostId = row.comment_post_id ?? row.post_id ?? row.target_id ?? null;
    if (!commentPostId) return null;

    const authorId = row.author_id ?? row.comment_user_id ?? row.user_id ?? null;
    if (!authorId) return null;

    let authorDisplayName =
      row.author_display_name ?? row.display_name ?? row?.profiles?.display_name ?? null;
    let authorHandle = row.author_handle ?? row.handle ?? row?.profiles?.handle ?? null;
    let authorAvatar =
      row.author_avatar_url ?? row.avatar_url ?? row?.profiles?.avatar_url ?? null;

    if (!authorDisplayName && !authorHandle && supabase) {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, handle, avatar_url')
        .eq('id', authorId)
        .maybeSingle();
      if (data) {
        authorDisplayName = data.display_name ?? null;
        authorHandle = data.handle ?? null;
        authorAvatar = data.avatar_url ?? null;
      }
    }

    return {
      comment_id: commentId,
      comment_post_id: commentPostId,
      author_id: authorId,
      comment_user_id: row.comment_user_id ?? authorId,
      body: row.body ?? '',
      created_at: row.created_at,
      parent_id: row.parent_id ?? null,
      is_public: row.is_public ?? true,
      thread_root_id: row.thread_root_id ?? commentId,
      depth: row.depth ?? (row.parent_id ? 1 : 0),
      author_display_name: authorDisplayName,
      author_handle: authorHandle,
      author_avatar_url: authorAvatar,
      reply_count: row.reply_count ?? 0
    };
  }

  async function handleRealtime(payload: any) {
    if (!payload) return;
    if (payload.eventType === 'INSERT') {
      const comment = await hydrateComment(payload.new);
      if (!comment) return;
      if (pendingIds.has(comment.comment_id)) {
        pendingIds.delete(comment.comment_id);
        return;
      }
      if (comment.parent_id) {
        addReply(comment.parent_id, comment);
      } else {
        addTopLevel(comment);
      }
      totalCount += 1;
    } else if (payload.eventType === 'DELETE') {
      const targetId = (payload.old?.comment_id ?? payload.old?.id) as string | undefined;
      if (!targetId) return;
      pruneComment(targetId);
    }
  }

  function setupRealtime() {
    if (!supabase) return;
    channel = supabase
      .channel(`post-${postId}-comments-thread`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        (payload) => {
          void handleRealtime(payload);
        }
      )
      .subscribe();
  }

  export async function refresh() {
    comments = [];
    nextCursor = null;
    seeded = true;
    await fetchTopLevel(true);
  }

  export function prepend(comment: PostComment) {
    addTopLevel(comment, true);
    totalCount += 1;
  }

  export function focusComposer() {
    composerRef?.focus();
  }

  onMount(() => {
    if (initialItems.length > 0 && !seeded) {
      const normalized = initialItems.map((row) => {
        const node = normalizeComment(row);
        node.depth = 0;
        return node;
      });
      comments = normalized;
      comments.forEach((comment) => {
        registerComment(comment);
        ensureReplyState(comment);
      });
      if (initialItems.length === pageSize) {
        const last = initialItems[initialItems.length - 1];
        nextCursor = initialCursor ?? (last?.created_at ?? null);
      } else {
        nextCursor = initialCursor ?? null;
      }
      if (initialCount === 0) {
        totalCount = Math.max(totalCount, initialItems.length);
      }
      for (const comment of comments) {
        initializeReplyPreview(comment);
      }
      seeded = true;
    } else {
      void fetchTopLevel(true);
    }
    setupRealtime();
  });

  onDestroy(() => {
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
    pendingIds.clear();
  });

  $: dispatch('count', totalCount);
</script>

<section class="comment-list" aria-live="polite">
  <CommentComposer bind:this={composerRef} postId={postId} on:posted={handleTopLevelPosted} />

  {#if errorMsg}
    <p class="status error" role="alert">{errorMsg}</p>
  {/if}

  {#if loading && comments.length === 0}
    <p class="status">Loading comments…</p>
  {:else if comments.length === 0}
    <p class="status muted">Be the first to comment.</p>
  {:else}
    <ul class="thread" role="list">
      {#each comments as comment (comment.comment_id)}
        <CommentItem
          postId={postId}
          {comment}
          threadHandle={threadHandle}
          threadSlug={threadSlug}
          {replyStates}
          replyPageSize={INLINE_REPLY_BATCH_SIZE}
          maxDepth={MAX_INLINE_DEPTH}
          on:replyPosted={handleReplyPosted}
          on:replyCount={handleReplyCount}
          on:toggleReplies={handleToggleReplies}
          on:loadReplies={handleLoadReplies}
          on:continueThread={handleContinueThread}
        />
      {/each}
    </ul>
    {#if nextCursor}
      <button
        class="load-more"
        type="button"
        on:click={loadMoreTopLevel}
        disabled={moreLoading}
      >
        {moreLoading ? 'Loading…' : 'View more comments'}
      </button>
    {/if}
  {/if}
</section>

<style>
  .comment-list {
    display: grid;
    gap: 12px;
  }

  .thread {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
  }

  .status {
    margin: 0;
    font-size: 0.82rem;
  }

  .status.muted {
    opacity: 0.7;
  }

  .status.error {
    color: #fca5a5;
  }

  .load-more {
    justify-self: flex-start;
    padding: 6px 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
