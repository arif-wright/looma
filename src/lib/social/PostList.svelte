<script lang="ts">
  import { onMount } from 'svelte';
  import PostCard from './PostCard.svelte';
  import type { PostRow } from './types';

  export let userId: string | null = null;
  export let pageSize = 20;
  export let emptyMessage = 'No posts yet.';
  export let refreshToken = 0;
  export let highlightPostId: string | null = null;

  let items: PostRow[] = [];
  let loading = false;
  let errorMsg: string | null = null;
  let reachedEnd = false;
  let mounted = false;
  let lastRefreshToken = refreshToken;

  const dedupe = (current: PostRow[], incoming: PostRow[]) => {
    const seen = new Set(current.map((item) => item.id));
    const additions = incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return [...current, ...additions];
  };

  async function load(initial = false) {
    if (loading || reachedEnd) return;
    loading = true;
    errorMsg = null;
    const cursor =
      initial || items.length === 0
        ? new Date().toISOString()
        : items[items.length - 1]?.created_at ?? new Date().toISOString();

    const params = new URLSearchParams();
    params.set('limit', String(pageSize));
    params.set('before', cursor);
    if (userId) params.set('user', userId);

    try {
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to load posts.';
        reachedEnd = false;
      } else {
        const payload = await res.json();
        const incoming = Array.isArray(payload?.items) ? (payload.items as PostRow[]) : [];
        items = initial ? incoming : dedupe(items, incoming);
        reachedEnd = incoming.length < pageSize;
      }
    } catch (err) {
      console.error('post list load error', err);
      errorMsg = err instanceof Error ? err.message : 'Failed to load posts.';
      reachedEnd = false;
    } finally {
      loading = false;
    }
  }

  async function resetAndLoad() {
    items = [];
    reachedEnd = false;
    await load(true);
  }

  export async function refresh() {
    await resetAndLoad();
  }


  onMount(async () => {
    mounted = true;
    await resetAndLoad();
  });

  $: if (mounted && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    resetAndLoad();
  }
</script>

<section class="post-list">
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  {#if loading && items.length === 0 && !errorMsg}
    <p class="loading">Loading posts…</p>
  {/if}
  {#if items.length === 0 && !loading && !errorMsg}
    <p class="empty">{emptyMessage}</p>
  {/if}
  <ul class="items">
    {#each items as post (post.id)}
      <li>
        <PostCard {post} highlighted={highlightPostId === post.id} />
      </li>
    {/each}
  </ul>
  <div class="footer">
    {#if !reachedEnd && items.length > 0}
      <button class="more" type="button" disabled={loading} on:click={() => load(false)}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    {/if}
  </div>
</section>

<style>
  .post-list {
    display: grid;
    gap: 8px;
  }

  .items {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .footer {
    display: flex;
    justify-content: center;
    padding: 4px 0 0;
  }

  .more {
    padding: 6px 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .more:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .empty {
    opacity: 0.7;
    margin: 0;
    font-size: 0.9rem;
  }

  .loading {
    opacity: 0.65;
    margin: 0;
    font-size: 0.9rem;
  }

  .error {
    margin: 0;
    font-size: 0.85rem;
    color: #fca5a5;
  }
</style>
