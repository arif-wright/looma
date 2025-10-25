<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentComposer from './CommentComposer.svelte';
  import CommentItem from './CommentItem.svelte';
  import {
    dedupeComments,
    findComment,
    mergeReplies,
    fetchPostComments,
    normalizeComment,
    removeCommentFromTree
  } from './commentHelpers';
  import type { CommentNode, PostComment } from './types';

  export let postId: string;
  export let pageSize = 10;
  export let initialCount = 0;
  export let initialItems: PostComment[] = [];
  export let initialCursor: string | null = null;

  const dispatch = createEventDispatcher<{ count: number }>();

  const supabaseClient = typeof window === 'undefined' ? null : supabaseBrowser();
  type SupabaseClient = NonNullable<typeof supabaseClient>;
  type SupabaseChannel = ReturnType<SupabaseClient['channel']>;
  const supabase = supabaseClient;

  let items: CommentNode[] = [];
  let loading = false;
  let moreLoading = false;
  let errorMsg: string | null = null;
  let nextCursor: string | null = null;
  let totalCount = initialCount;
  let channel: SupabaseChannel | null = null;
  let composerRef: InstanceType<typeof CommentComposer> | null = null;
  let isMounted = false;
  let seeded = false;

  const pendingIds = new Set<string>();

  function registerPending(id: string) {
    pendingIds.add(id);
    setTimeout(() => pendingIds.delete(id), 1500);
  }

  async function load(initial = false) {
    if (initial) {
      loading = true;
      errorMsg = null;
    } else {
      if (!nextCursor || moreLoading) return;
      moreLoading = true;
    }
    const cursor = initial ? new Date().toISOString() : nextCursor;
    if (!initial && !cursor) {
      moreLoading = false;
      return;
    }

    const { items: incoming, error } = await fetchPostComments(postId, {
      limit: pageSize,
      before: cursor ?? new Date().toISOString()
    });

    if (error) {
      errorMsg = error;
    } else {
      errorMsg = null;
      const normalized = incoming.map(normalizeComment);
      items = initial ? normalized : dedupeComments(items, normalized);
      if (initial && totalCount === 0) {
        totalCount = Math.max(totalCount, incoming.length);
      }
      const last = incoming.length > 0 ? incoming[incoming.length - 1] : null;
      nextCursor =
        incoming.length === pageSize && last?.created_at
          ? (last.created_at as string)
          : null;
    }

    if (initial) {
      loading = false;
    } else {
      moreLoading = false;
    }
  }

  async function loadMore() {
    await load(false);
  }

  function addTopLevel(comment: PostComment, optimistic = false) {
    const node = normalizeComment(comment);
    items = dedupeComments(items, [node]);
    if (optimistic) registerPending(comment.id);
  }

  function addReply(parentId: string, reply: PostComment) {
    const parent = findComment(items, parentId);
    if (!parent) return false;
    parent.replies = mergeReplies(parent.replies ?? [], [normalizeComment(reply)]);
    parent.repliesVisible = true;
    parent.reply_count = (parent.reply_count ?? 0) + 1;
    parent.repliesTotal = (parent.repliesTotal ?? parent.reply_count ?? 0) + 1;
    items = [...items];
    return true;
  }

  function updateReplyCount(parentId: string, total: number) {
    const parent = findComment(items, parentId);
    if (!parent) return;
    parent.reply_count = total;
    parent.repliesTotal = total;
    items = [...items];
  }

  function handleTopLevelPosted(event: CustomEvent<{ comment?: PostComment; parentId: string | null }>) {
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
    errorMsg = null;
    const inserted = addReply(parentId, reply);
    registerPending(reply.id);
    if (inserted) {
      totalCount += 1;
    }
  }

  function handleReplyCount(event: CustomEvent<{ parentId: string; total: number }>) {
    const { parentId, total } = event.detail;
    if (!parentId) return;
    updateReplyCount(parentId, total);
  }

  async function hydrateComment(row: any): Promise<PostComment | null> {
    if (!row?.id) return null;
    let displayName = row.display_name ?? row?.profiles?.display_name ?? null;
    let handle = row.handle ?? row?.profiles?.handle ?? null;
    let avatar = row.avatar_url ?? row?.profiles?.avatar_url ?? null;
    const authorId = row.author_id ?? row.comment_user_id ?? null;

    if ((!displayName && !handle) && supabase) {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, handle, avatar_url')
        .eq('id', authorId)
        .maybeSingle();
      if (data) {
        displayName = data.display_name ?? null;
        handle = data.handle ?? null;
        avatar = data.avatar_url ?? null;
      }
    }

    return {
      id: row.id,
      post_id: row.post_id,
      author_id: authorId ?? row.comment_user_id ?? null,
      comment_user_id: row.comment_user_id ?? authorId ?? null,
      body: row.body ?? '',
      created_at: row.created_at,
      parent_id: row.parent_id ?? null,
      is_public: row.is_public ?? true,
      thread_root_id: row.thread_root_id ?? row.id,
      depth: row.depth ?? (row.parent_id ? 1 : 0),
      display_name: displayName,
      handle,
      avatar_url: avatar,
      reply_count: row.reply_count ?? 0
    };
  }

  async function handleRealtime(payload: any) {
    if (!payload) return;
    if (payload.eventType === 'INSERT') {
      const comment = await hydrateComment(payload.new);
      if (!comment) return;
      if (pendingIds.has(comment.id)) {
        pendingIds.delete(comment.id);
        totalCount = Math.max(totalCount, items.length);
        return;
      }
      if (comment.parent_id) {
        if (addReply(comment.parent_id, comment)) {
          totalCount += 1;
        }
      } else {
        addTopLevel(comment);
        totalCount += 1;
      }
    } else if (payload.eventType === 'DELETE') {
      const row = payload.old;
      if (!row?.id) return;
      const result = removeCommentFromTree(items, row.id as string);
      if (result.removed > 0) {
        items = result.tree;
        totalCount = Math.max(0, totalCount - result.removed);
      }
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
    items = [];
    nextCursor = null;
    seeded = true;
    await load(true);
  }

  export function prepend(comment: PostComment) {
    addTopLevel(comment, true);
    totalCount += 1;
  }

  export function focusComposer() {
    composerRef?.focus();
  }

  onMount(() => {
    isMounted = true;
    if (initialItems.length > 0 && !seeded) {
      items = initialItems.map(normalizeComment);
      if (initialItems.length === pageSize) {
        const last = initialItems[initialItems.length - 1];
        nextCursor = initialCursor ?? (last?.created_at ?? null);
      } else {
        nextCursor = initialCursor ?? null;
      }
      seeded = true;
      if (initialCount === 0) {
        totalCount = Math.max(totalCount, initialItems.length);
      }
    } else {
      load(true);
    }
    setupRealtime();
  });

  onDestroy(() => {
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
    pendingIds.clear();
  });

  $: if (isMounted) {
    dispatch('count', totalCount);
  }
</script>

<section class="comment-list">
  <CommentComposer bind:this={composerRef} postId={postId} on:posted={handleTopLevelPosted} />

  {#if errorMsg}
    <p class="status error" role="alert">{errorMsg}</p>
  {/if}

  {#if loading && items.length === 0}
    <p class="status">Loading comments…</p>
  {:else if items.length === 0}
    <p class="status muted">Be the first to comment.</p>
  {:else}
    <ul class="thread">
      {#each items as comment (comment.id)}
        <CommentItem
          postId={postId}
          comment={comment}
          on:replyPosted={handleReplyPosted}
          on:replyCount={handleReplyCount}
        />
      {/each}
    </ul>
    {#if nextCursor}
      <button class="load-more" type="button" on:click={loadMore} disabled={moreLoading}>
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
