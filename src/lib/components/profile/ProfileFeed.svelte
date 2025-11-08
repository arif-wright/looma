<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import PostCard from '$lib/social/PostCard.svelte';
  import type { PostRow } from '$lib/social/types';

  export let authorIdentifier: string;
  export let initialItems: PostRow[] = [];
  export let initialCursor: string | null = null;
  export let emptyMessage = 'No moments to show yet.';

  let items: PostRow[] = [...initialItems];
  let cursor: string | null = initialCursor;
  let loading = false;
  let errorMsg: string | null = null;
  let observer: IntersectionObserver | null = null;
  let sentinel: HTMLDivElement | null = null;

  export function prepend(post: PostRow) {
    items = [post, ...items];
  }

  const observe = () => {
    if (!browser || !sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMore();
          }
        });
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
  };

  onMount(() => {
    observe();
  });

  onDestroy(() => {
    observer?.disconnect();
  });

  async function loadMore() {
    if (!browser || loading || !cursor) return;
    loading = true;
    errorMsg = null;
    try {
      const url = new URL(`/api/profile/${encodeURIComponent(authorIdentifier)}/posts`, window.location.origin);
      url.searchParams.set('cursor', cursor);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        errorMsg = payload?.error ?? 'Unable to load more posts.';
        return;
      }
      const payload = await res.json();
      const incoming = Array.isArray(payload?.items) ? (payload.items as PostRow[]) : [];
      items = [...items, ...incoming];
      cursor = payload?.nextCursor ?? null;
    } catch (err) {
      console.error('profile feed load error', err);
      errorMsg = err instanceof Error ? err.message : 'Unable to load feed.';
    } finally {
      loading = false;
    }
  }
</script>

<section class="profile-feed">
  {#if items.length === 0 && !loading}
    <p class="empty">{emptyMessage}</p>
  {/if}
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  <ul class="items">
    {#each items as post (post.id)}
      <li>
        {#if browser}
          <PostCard {post} />
        {/if}
      </li>
    {/each}
  </ul>
  {#if cursor}
    <div class="load-more">
      <button type="button" class="ghost-btn" on:click={loadMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  {/if}
  <div bind:this={sentinel}></div>
</section>

<style>
  .profile-feed {
    display: grid;
    gap: 1rem;
  }

  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .load-more {
    display: flex;
    justify-content: center;
  }

  .ghost-btn {
    padding: 0.45rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    cursor: pointer;
  }

  .empty,
  .error {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .error {
    color: #fca5a5;
  }
</style>
