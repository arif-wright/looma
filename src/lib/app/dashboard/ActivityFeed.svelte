<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  type Row = { id: string; type: string | null; message: string | null; created_at: string };

  const PAGE_SIZE = 10;

  let loading = true;
  let error: string | null = null;
  let items: Row[] = [];
  let page = 0;
  let endReached = false;
  let userId: string | null = null;

  let supabase = supabaseBrowser();
  let channel: RealtimeChannel | null = null;

  async function ensureUserId() {
    if (userId) return userId;
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('No session');
    userId = user.id;
    return userId;
  }

  async function subscribeToRealtime(user: string) {
    if (channel) return;

    channel = supabase
      .channel('events-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${user}` },
        (payload) => {
          const row = payload.new as Row;
          if (!row) return;
          items = [row, ...items.filter((i) => i.id !== row.id)];
        }
      )
      .subscribe();
  }

  async function fetchPage(reset = false) {
    try {
      const user = await ensureUserId();

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: queryError } = await supabase
        .from('events')
        .select('id, type, message, created_at')
        .eq('user_id', user)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (queryError) throw queryError;

      const rows = (data as Row[]) ?? [];

      if (reset) {
        items = rows;
      } else {
        const existingIds = new Set(items.map((item) => item.id));
        items = [...items, ...rows.filter((row) => !existingIds.has(row.id))];
      }

      if (rows.length < PAGE_SIZE) {
        endReached = true;
      }

      await subscribeToRealtime(user);
    } catch (err) {
      console.error('ActivityFeed load error:', err);
      error = err instanceof Error ? err.message : 'Failed to load feed';
    }
  }

  async function loadInitial() {
    loading = true;
    error = null;
    items = [];
    page = 0;
    endReached = false;
    await fetchPage(true);
    loading = false;
  }

  async function loadMore() {
    if (endReached || loading) return;
    page += 1;
    await fetchPage();
  }

  onMount(() => {
    loadInitial();
  });

  onDestroy(() => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
  });
</script>

<PanelFrame title="Activity" {loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" class="retry-button" on:click={loadInitial}>Retry</button>
    </div>
  {:else if items.length === 0}
    <div class="empty-state">No recent activity.</div>
  {:else}
    <ul class="event-list" aria-live="polite">
      {#each items as event}
        <li class="event-item">
          <div class="event-text">
            <div class="message" title={event.message ?? 'Event'}>
              {event.message ?? 'Event'}
            </div>
            <div class="type" title={event.type ?? 'event'}>
              {event.type ?? 'event'}
            </div>
          </div>
          <div class="timestamp">{new Date(event.created_at).toLocaleString()}</div>
        </li>
      {/each}
    </ul>

    {#if !endReached}
      <div class="load-more">
        <button type="button" class="load-more-button" on:click={loadMore}>Load more</button>
      </div>
    {/if}
  {/if}

  <svelte:fragment slot="skeleton">
    <div class="skeleton">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #fca5a5;
  }

  .retry-button {
    background: none;
    border: 0;
    color: rgba(233, 195, 255, 0.85);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }

  .retry-button:hover,
  .retry-button:focus-visible {
    color: #ffffff;
  }

  .empty-state {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.85rem;
  }

  .event-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .event-text {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  .message {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: 0.8rem;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timestamp {
    font-size: 0.75rem;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .load-more {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
  }

  .load-more-button {
    background: none;
    border: 0;
    color: rgba(233, 195, 255, 0.85);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
  }

  .load-more-button:hover,
  .load-more-button:focus-visible {
    color: #ffffff;
  }

  .skeleton {
    display: grid;
    gap: 0.8rem;
  }

  .skeleton-row {
    height: 2.5rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.08);
    animation: pulse 1.3s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-row {
      animation: none;
    }
  }
</style>
