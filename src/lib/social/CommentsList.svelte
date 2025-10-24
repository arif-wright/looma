<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import type { PostComment } from './types';

  export let postId: string;
  export let pageSize = 20;

  const supabase = supabaseBrowser();
  const dispatch = createEventDispatcher<{ count: number }>();

  let items: PostComment[] = [];
  let loading = false;
  let moreLoading = false;
  let reachedEnd = false;
  let errorMsg: string | null = null;
  let nextCursor: string | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  const dedupe = (existing: PostComment[], incoming: PostComment[]) => {
    const seen = new Set<string>();
    const merged = [...incoming, ...existing];
    const unique: PostComment[] = [];
    for (const row of merged) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      unique.push(row);
    }
    // Items supplied newest-first; ensure consistent ordering by created_at desc.
    unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return unique;
  };

  function updateCount() {
    dispatch('count', items.length);
  }

  async function load(initial = false) {
    if (loading || (reachedEnd && !initial)) return;
    if (initial) {
      loading = true;
      errorMsg = null;
    } else {
      moreLoading = true;
    }
    const before =
      initial || !nextCursor ? new Date().toISOString() : nextCursor ?? new Date().toISOString();
    const params = new URLSearchParams();
    params.set('limit', String(pageSize));
    params.set('before', before);
    try {
      const res = await fetch(`/api/posts/${postId}/comments?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error ?? 'Failed to load comments.';
        throw new Error(message);
      }
      const payload = await res.json();
      const incoming = Array.isArray(payload?.items) ? (payload.items as PostComment[]) : [];
      nextCursor = typeof payload?.nextCursor === 'string' ? payload.nextCursor : null;
      reachedEnd = !nextCursor || incoming.length < pageSize;
      if (initial) {
        items = incoming;
      } else {
        items = dedupe(items, incoming);
      }
      updateCount();
    } catch (err) {
      console.error('comments load error', err);
      errorMsg = err instanceof Error ? err.message : 'Failed to load comments.';
    } finally {
      if (initial) {
        loading = false;
      } else {
        moreLoading = false;
      }
    }
  }

  export async function refresh() {
    items = [];
    nextCursor = null;
    reachedEnd = false;
    await load(true);
  }

  export function prepend(comment: PostComment) {
    items = dedupe(items, [comment]);
    updateCount();
  }

  function remove(commentId: string) {
    const before = items.length;
    items = items.filter((row) => row.id !== commentId);
    if (items.length !== before) {
      updateCount();
    }
  }

  function profileFromCache(userId: string) {
    const found = items.find((entry) => entry.user_id === userId);
    if (!found) return null;
    return {
      display_name: found.display_name,
      handle: found.handle,
      avatar_url: found.avatar_url
    };
  }

  async function handleRealtime(payload: any) {
    if (!payload?.new && !payload?.old) return;
    if (payload.eventType === 'INSERT') {
      const row = payload.new;
      if (row?.target_kind !== 'post' || row?.target_id !== postId) return;
      let displayName = row.display_name ?? row.profiles?.display_name ?? null;
      let handle = row.handle ?? row.profiles?.handle ?? null;
      let avatar = row.avatar_url ?? row.profiles?.avatar_url ?? null;
      if (!displayName && !handle) {
        const cached = profileFromCache(row.user_id);
        if (cached) {
          displayName = cached.display_name;
          handle = cached.handle;
          avatar = cached.avatar_url;
        } else {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name, handle, avatar_url')
            .eq('id', row.user_id)
            .maybeSingle();
          if (prof) {
            displayName = prof.display_name ?? null;
            handle = prof.handle ?? null;
            avatar = prof.avatar_url ?? null;
          }
        }
      }
      const comment: PostComment = {
        id: row.id,
        user_id: row.user_id,
        body: row.body,
        created_at: row.created_at,
        display_name: displayName,
        handle,
        avatar_url: avatar
      };
      prepend(comment);
    } else if (payload.eventType === 'DELETE') {
      const row = payload.old;
      if (row?.target_kind !== 'post' || row?.target_id !== postId) return;
      remove(row.id);
    }
  }

  onMount(async () => {
    await load(true);
    channel = supabase
      .channel(`post-${postId}-comments`)
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

<div class="comments">
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  {#if loading}
    <p class="loading">Loading comments…</p>
  {:else if items.length === 0}
    <p class="empty">Be the first to comment.</p>
  {:else}
    <ul class="list">
      {#each items as item (item.id)}
        <li class="entry">
          <img
            class="avatar"
            src={item.avatar_url ?? '/avatar.svg'}
            alt=""
            width="28"
            height="28"
            loading="lazy"
          />
          <div class="body">
            <div class="meta">
              <a class="name" href={`/u/${item.handle ?? item.user_id}`}>
                {item.display_name ?? (item.handle ? `@${item.handle}` : 'Someone')}
              </a>
              <span class="when">{new Date(item.created_at).toLocaleString()}</span>
            </div>
            <p class="text">{item.body}</p>
          </div>
        </li>
      {/each}
    </ul>
    {#if !reachedEnd}
      <button
        class="load-more"
        type="button"
        on:click={() => load(false)}
        disabled={moreLoading}
        aria-label="Load more comments"
      >
        {moreLoading ? 'Loading…' : 'Load more'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .comments {
    display: grid;
    gap: 10px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  .entry {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.04);
  }

  .body {
    display: grid;
    gap: 4px;
  }

  .meta {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .name {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }

  .name:hover,
  .name:focus-visible {
    text-decoration: underline;
  }

  .when {
    font-size: 0.72rem;
  }

  .text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.35;
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

  .load-more {
    align-self: center;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .load-more:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
