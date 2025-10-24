<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentComposer from './CommentComposer.svelte';
  import type { PostComment } from './types';

  type ThreadNode = PostComment & {
    replies?: PostComment[];
    repliesNextCursor?: string | null;
    repliesVisible?: boolean;
    repliesLoading?: boolean;
    repliesError?: string | null;
    isReplying?: boolean;
  };

  const TOP_LEVEL_LIMIT = 20;
  const REPLIES_LIMIT = 10;

  export let postId: string;
  export let initialComments: PostComment[] = [];
  export let initialCursor: string | null = null;
  export let initialTotal = 0;

  const supabase = supabaseBrowser();
  const dispatch = createEventDispatcher<{ count: number }>();

  let items: ThreadNode[] = dedupeTopLevel(initialComments.map(enhance));
  let nextCursor: string | null = initialCursor;
  let loadError: string | null = null;
  let loadingMore = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let totalCount = initialTotal;
  let pendingScrollId: string | null = null;
  let composerRef: InstanceType<typeof CommentComposer> | null = null;
  let composerContainer: HTMLDivElement | null = null;

  $: dispatch('count', totalCount);

  function enhance(comment: PostComment): ThreadNode {
    return {
      ...comment,
      reply_count: comment.reply_count ?? 0,
      replies: comment.parent_id ? undefined : [],
      repliesNextCursor: null,
      repliesVisible: false,
      repliesLoading: false,
      repliesError: null,
      isReplying: false
    };
  }

  function dedupeTopLevel(list: ThreadNode[]): ThreadNode[] {
    const map = new Map<string, ThreadNode>();
    for (const node of list) {
      const existing = map.get(node.id);
      map.set(node.id, mergeThreadNode(existing, node));
    }
    return Array.from(map.values()).sort(sortDesc);
  }

  function mergeThreadNode(existing: ThreadNode | undefined, incoming: ThreadNode): ThreadNode {
    if (!existing) {
      return {
        ...incoming,
        replies: incoming.replies ?? [],
        repliesNextCursor: incoming.repliesNextCursor ?? null,
        repliesVisible: incoming.repliesVisible ?? false,
        repliesLoading: incoming.repliesLoading ?? false,
        repliesError: incoming.repliesError ?? null,
        isReplying: incoming.isReplying ?? false
      };
    }
    return {
      ...existing,
      ...incoming,
      reply_count: incoming.reply_count ?? existing.reply_count ?? 0,
      replies: existing.replies ?? incoming.replies ?? [],
      repliesNextCursor: incoming.repliesNextCursor ?? existing.repliesNextCursor ?? null,
      repliesVisible: existing.repliesVisible ?? incoming.repliesVisible ?? false,
      repliesLoading: existing.repliesLoading ?? incoming.repliesLoading ?? false,
      repliesError: incoming.repliesError ?? existing.repliesError ?? null,
      isReplying: existing.isReplying ?? incoming.isReplying ?? false
    };
  }

  function sortDesc(a: { created_at: string }, b: { created_at: string }) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }

  function dedupeReplies(existing: PostComment[], incoming: PostComment[]): PostComment[] {
    const map = new Map<string, PostComment>();
    for (const reply of [...existing, ...incoming]) {
      map.set(reply.id, { ...map.get(reply.id), ...reply });
    }
    return Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  function relativeTime(value: string) {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return value;
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString();
  }

  function scrollToComment(id: string) {
    pendingScrollId = id;
  }

  export function focusComposer() {
    composerRef?.focus();
    if (composerContainer) {
      composerContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  $: if (pendingScrollId) {
    tick().then(() => {
      const el = document.getElementById(`comment-${pendingScrollId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      pendingScrollId = null;
    });
  }

  async function loadMoreTopLevel() {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    loadError = null;
    try {
      const params = new URLSearchParams();
      params.set('limit', String(TOP_LEVEL_LIMIT));
      params.set('before', nextCursor);
      const res = await fetch(`/api/posts/${postId}/comments?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to load comments');
      }
      const payload = await res.json();
      const incoming: PostComment[] = Array.isArray(payload?.items) ? payload.items : [];
      items = dedupeTopLevel([...items, ...incoming.map(enhance)]);
      nextCursor = typeof payload?.nextCursor === 'string' ? payload.nextCursor : null;
    } catch (err) {
      console.error('load more comments error', err);
      loadError = err instanceof Error ? err.message : 'Failed to load comments';
    } finally {
      loadingMore = false;
    }
  }

  function insertTopLevel(comment: PostComment): boolean {
    const node = enhance({ ...comment, parent_id: null });
    const before = items.find((c) => c.id === node.id);
    items = dedupeTopLevel([node, ...items]);
    return !before;
  }

  function findParent(parentId: string): ThreadNode | undefined {
    return items.find((c) => c.id === parentId);
  }

  function upsertReply(parentId: string, reply: PostComment): boolean {
    const parent = findParent(parentId);
    if (!parent) return false;

    const existingReplies = parent.replies ?? [];
    const merged = dedupeReplies(existingReplies, [reply]);
    const wasPresent = existingReplies.some((r) => r.id === reply.id);
    parent.replies = merged;
    parent.reply_count = wasPresent
      ? Math.max(parent.reply_count ?? 0, merged.length)
      : (parent.reply_count ?? 0) + 1;
    items = [...items];
    return !wasPresent;
  }

  async function loadReplies(parent: ThreadNode, appendOlder = false) {
    if (parent.repliesLoading) return;
    parent.repliesLoading = true;
    parent.repliesError = null;
    items = [...items];
    try {
      const cursor = appendOlder && parent.repliesNextCursor ? parent.repliesNextCursor : new Date().toISOString();
      const params = new URLSearchParams();
      params.set('limit', String(REPLIES_LIMIT));
      params.set('before', cursor);
      const res = await fetch(`/api/comments/${parent.id}/replies?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to load replies');
      }
      const payload = await res.json();
      const incoming: PostComment[] = Array.isArray(payload?.items) ? payload.items : [];
      const reversed = incoming.slice().reverse();
      const current = parent.replies ?? [];
      parent.replies = dedupeReplies(reversed, current);
      parent.repliesNextCursor = typeof payload?.nextCursor === 'string' ? payload.nextCursor : null;
      parent.reply_count = Math.max(parent.reply_count ?? 0, parent.replies.length);
    } catch (err) {
      console.error('load replies error', err);
      parent.repliesError = err instanceof Error ? err.message : 'Failed to load replies';
    } finally {
      parent.repliesLoading = false;
      items = [...items];
    }
  }

  function toggleReplyComposer(comment: ThreadNode) {
    comment.isReplying = !comment.isReplying;
    items = [...items];
  }

  async function toggleReplies(comment: ThreadNode) {
    comment.repliesVisible = !comment.repliesVisible;
    items = [...items];
    if (comment.repliesVisible && (comment.replies?.length ?? 0) === 0 && (comment.reply_count ?? 0) > 0) {
      await loadReplies(comment, false);
    }
  }

  async function handleTopLevelPosted(event: CustomEvent<{ comment: PostComment; counts: { comments: number; likes: number } }>) {
    const { comment, counts } = event.detail;
    const inserted = insertTopLevel(comment);
    totalCount = typeof counts?.comments === 'number' ? counts.comments : totalCount + (inserted ? 1 : 0);
    scrollToComment(comment.id);
  }

  async function handleReplyPosted(parent: ThreadNode, event: CustomEvent<{ comment: PostComment; counts: { comments: number; likes: number } }>) {
    const { comment, counts } = event.detail;
    const inserted = upsertReply(parent.id, { ...comment, parent_id: parent.id });
    parent.isReplying = false;
    parent.repliesVisible = true;
    parent.replies = parent.replies ?? [];
    items = [...items];
    totalCount = typeof counts?.comments === 'number' ? counts.comments : totalCount + (inserted ? 1 : 0);
    scrollToComment(comment.id);
  }

  async function hydrateComment(row: any): Promise<PostComment> {
    let displayName = row.display_name ?? row?.profiles?.display_name ?? null;
    let handle = row.handle ?? row?.profiles?.handle ?? null;
    let avatar = row.avatar_url ?? row?.profiles?.avatar_url ?? null;

    if (!displayName && !handle) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, handle, avatar_url')
        .eq('id', row.user_id)
        .maybeSingle();
      if (profile) {
        displayName = profile.display_name ?? null;
        handle = profile.handle ?? null;
        avatar = profile.avatar_url ?? null;
      }
    }

    return {
      id: row.id,
      user_id: row.user_id,
      body: row.body,
      created_at: row.created_at,
      parent_id: row.parent_id ?? null,
      display_name: displayName,
      handle,
      avatar_url: avatar,
      reply_count: row.reply_count ?? null
    };
  }

  async function handleRealtime(payload: any) {
    const record = payload.new ?? payload.old;
    if (!record || record.target_kind !== 'post' || record.target_id !== postId) return;

    if (payload.eventType === 'INSERT') {
      const comment = await hydrateComment(payload.new);
      if (comment.parent_id) {
        const added = upsertReply(comment.parent_id, comment);
        if (added) totalCount += 1;
      } else {
        const added = insertTopLevel(comment);
        if (added) totalCount += 1;
      }
    } else if (payload.eventType === 'DELETE') {
      const removed = removeComment(record.id, record.parent_id ?? null);
      if (removed > 0) totalCount = Math.max(0, totalCount - removed);
    }
  }

  function removeComment(commentId: string, parentId: string | null): number {
    if (parentId) {
      const parent = findParent(parentId);
      if (!parent || !parent.replies) return 0;
      const before = parent.replies.length;
      parent.replies = parent.replies.filter((reply) => reply.id !== commentId);
      const diff = before - parent.replies.length;
      if (diff > 0) {
        parent.reply_count = Math.max(0, (parent.reply_count ?? 0) - diff);
        items = [...items];
      }
      return diff;
    }

    const target = items.find((comment) => comment.id === commentId);
    if (!target) return 0;
    const replyTotal = target.replies?.length ?? target.reply_count ?? 0;
    items = items.filter((comment) => comment.id !== commentId);
    const diff = 1 + replyTotal;
    return diff;
  }

  onMount(() => {
    channel = supabase
      .channel(`post-${postId}-thread`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `target_kind=eq.post,target_id=eq.${postId}`
        },
        handleRealtime
      )
      .subscribe();
  });

  onDestroy(() => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  });
</script>

<section class="comment-tree">
  <div class="composer-root" bind:this={composerContainer}>
    <CommentComposer bind:this={composerRef} postId={postId} on:posted={handleTopLevelPosted} />
  </div>

  {#if items.length === 0}
    <p class="empty">Be the first to reply.</p>
  {:else}
    <ul class="thread" aria-live="polite">
      {#each items as comment (comment.id)}
        <li class="comment" id={`comment-${comment.id}`}>
          <img
            class="avatar"
            src={comment.avatar_url ?? '/avatar.svg'}
            alt=""
            width="34"
            height="34"
            loading="lazy"
          />
          <div class="content">
            <div class="header">
              <a class="name" href={`/u/${comment.handle ?? comment.user_id}`}>
                {comment.display_name ?? (comment.handle ? `@${comment.handle}` : 'Someone')}
              </a>
              <span class="when">{relativeTime(comment.created_at)}</span>
            </div>
            <p class="body">{comment.body}</p>
            <div class="actions">
              <button type="button" class="text-btn" on:click={() => toggleReplyComposer(comment)}>
                {comment.isReplying ? 'Cancel reply' : 'Reply'}
              </button>
              {#if (comment.reply_count ?? 0) > 0}
                <button type="button" class="text-btn" on:click={() => toggleReplies(comment)}>
                  {#if comment.repliesVisible}
                    Hide replies
                  {:else}
                    View replies ({comment.reply_count})
                  {/if}
                </button>
              {/if}
            </div>

            {#if comment.isReplying}
              <div class="reply-composer">
                <CommentComposer
                  postId={postId}
                  parentId={comment.id}
                  on:posted={(event) => handleReplyPosted(comment, event)}
                />
              </div>
            {/if}

            {#if comment.repliesVisible}
              <div class="replies">
                {#if comment.repliesError}
                  <div class="reply-error">
                    <span>{comment.repliesError}</span>
                    <button type="button" on:click={() => loadReplies(comment, true)}>Retry</button>
                  </div>
                {/if}

                {#if comment.repliesLoading && (comment.replies?.length ?? 0) === 0}
                  <p class="loading">Loading replies…</p>
                {/if}

                {#if comment.replies && comment.replies.length > 0}
                  <ul class="reply-list">
                    {#each comment.replies as reply (reply.id)}
                      <li class="reply" id={`comment-${reply.id}`}>
                        <img
                          class="avatar"
                          src={reply.avatar_url ?? '/avatar.svg'}
                          alt=""
                          width="28"
                          height="28"
                          loading="lazy"
                        />
                        <div class="content">
                          <div class="header">
                            <a class="name" href={`/u/${reply.handle ?? reply.user_id}`}>
                              {reply.display_name ?? (reply.handle ? `@${reply.handle}` : 'Someone')}
                            </a>
                            <span class="when">{relativeTime(reply.created_at)}</span>
                          </div>
                          <p class="body">{reply.body}</p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                {:else if !comment.repliesLoading}
                  <p class="empty">No replies yet.</p>
                {/if}

                {#if comment.repliesNextCursor}
                  <button
                    class="text-btn load-more"
                    type="button"
                    on:click={() => loadReplies(comment, true)}
                    disabled={comment.repliesLoading}
                  >
                    {comment.repliesLoading ? 'Loading…' : 'Load more replies'}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  {#if nextCursor}
    <button class="load-top" type="button" on:click={loadMoreTopLevel} disabled={loadingMore}>
      {loadingMore ? 'Loading…' : 'Load more comments'}
    </button>
  {/if}
</section>

<style>
  .comment-tree {
    display: grid;
    gap: 16px;
  }

  .thread {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 18px;
  }

  .comment {
    display: grid;
    grid-template-columns: 34px 1fr;
    gap: 12px;
  }

  .avatar {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.04);
  }

  .content {
    display: grid;
    gap: 6px;
  }

  .header {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.8rem;
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
    font-size: 0.75rem;
  }

  .body {
    margin: 0;
    line-height: 1.45;
    font-size: 0.9rem;
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    gap: 12px;
  }

  .text-btn {
    border: none;
    background: none;
    color: inherit;
    font-size: 0.78rem;
    opacity: 0.75;
    cursor: pointer;
    padding: 0;
  }

  .text-btn:hover,
  .text-btn:focus-visible {
    opacity: 1;
    text-decoration: underline;
  }

  .reply-composer {
    margin-top: 8px;
  }

  .replies {
    margin-top: 8px;
    padding-left: 20px;
    display: grid;
    gap: 10px;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  .reply-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  .reply {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
  }

  .reply .avatar {
    width: 28px;
    height: 28px;
  }

  .load-top {
    justify-self: center;
    padding: 6px 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .load-top:disabled,
  .load-more:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .empty,
  .loading,
  .error {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.75;
  }

  .error {
    color: #fca5a5;
    opacity: 1;
  }

  .reply-error {
    display: flex;
    gap: 6px;
    font-size: 0.78rem;
    color: #fca5a5;
    align-items: center;
  }

  .reply-error button {
    border: none;
    background: none;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.78rem;
  }
</style>
