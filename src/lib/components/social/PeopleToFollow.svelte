<script lang="ts">
  import { onMount } from 'svelte';
  import PeopleToFollowItem from './PeopleToFollowItem.svelte';

  export let title = 'People you may know';
  export let dense = false;

  type Recommendation = {
    user_id: string;
    mutuals: number;
    shared_following: number;
    popularity: number;
    score: number;
    profile: {
      handle: string;
      display_name: string;
      avatar_url?: string | null;
    };
  };

  let items: Recommendation[] = [];
  let next: number | null = 0;
  let loading = false;
  let errorMessage = '';

  const pageSize = () => (dense ? 6 : 12);

  async function loadMore() {
    if (loading || next === null) return;
    loading = true;
    errorMessage = '';
    try {
      const params = new URLSearchParams({ from: String(next), limit: String(pageSize()) });
      const res = await fetch(`/api/recs/people?${params.toString()}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const payload = await res.json();
      const batch = Array.isArray(payload.items) ? (payload.items as Recommendation[]) : [];
      items = [...items, ...batch];
      next = typeof payload.next === 'number' ? payload.next : null;
    } catch (err) {
      console.error('[PeopleToFollow] fetch failed', err);
      errorMessage = 'Unable to load suggestions right now.';
      next = null;
    } finally {
      loading = false;
    }
  }

  async function handleFollow(id: string) {
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, action: 'follow' })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      items = items.filter((item) => item.user_id !== id);
    } catch (err) {
      console.error('[PeopleToFollow] follow failed', err);
    }
  }

  onMount(() => {
    void loadMore();
  });
</script>

<div class="rec-widget" data-testid="people-to-follow">
  <div class="rec-header">
    <h3>{title}</h3>
    {#if next !== null}
      <button type="button" on:click={loadMore} disabled={loading}>{loading ? 'Loading…' : 'More'}</button>
    {/if}
  </div>

  <div class="rec-list" data-testid="people-to-follow-list">
    {#each items as item (item.user_id)}
      <PeopleToFollowItem {...item} onFollow={handleFollow} />
    {/each}
    {#if !items.length && !loading && !errorMessage}
      <p class="rec-empty">No suggestions right now.</p>
    {/if}
    {#if errorMessage}
      <p class="rec-error">{errorMessage}</p>
    {/if}
  </div>
</div>

<style>
  .rec-widget {
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 19, 31, 0.72);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .rec-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .rec-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }

  .rec-header button {
    border: none;
    background: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0.15rem 0.35rem;
    border-radius: 0.75rem;
  }

  .rec-header button:hover:not(:disabled) {
    color: #fff;
  }

  .rec-header button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .rec-list {
    display: grid;
    gap: 0.9rem;
  }

  .rec-empty,
  .rec-error {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .rec-error {
    color: #f87171;
  }
</style>
