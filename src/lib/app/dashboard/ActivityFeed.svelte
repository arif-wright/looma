<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';

  type Row = { id: string; type: string; message: string; created_at: string };

  let loading = true;
  let error: string | null = null;
  let items: Row[] = [];
  let page = 0;
  const PAGE_SIZE = 12;
  let endReached = false;
  let userId: string | null = null;
  let channel: any;

  const icon = (t: string) => {
    const k = (t || '').toLowerCase();
    if (k.includes('level')) return '⬆️';
    if (k.includes('bond')) return '🪄';
    if (k.includes('xp')) return '⚡';
    return '•';
  };

  async function fetchPage(reset = false) {
    const supabase = supabaseBrowser();
    if (!userId) {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');
      userId = user.id;
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: err } = await supabase
      .from('events')
      .select('id, type, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (err) throw err;

    items = reset ? ((data as Row[]) ?? []) : [...items, ...((data as Row[]) ?? [])];
    if (!data || data.length < PAGE_SIZE) endReached = true;

    if (!channel) {
      channel = supabase
        .channel('events-rt')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` },
          (payload) => {
            items = [payload.new as Row, ...items];
          }
        )
        .subscribe();
    }
  }

  async function loadInitial() {
    loading = true;
    error = null;
    items = [];
    page = 0;
    endReached = false;
    try {
      await fetchPage(true);
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
    }
    loading = false;
  }

  async function loadMore() {
    if (endReached) return;
    page += 1;
    try {
      await fetchPage();
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
    }
  }

  onMount(loadInitial);
  onDestroy(() => {
    try {
      channel?.unsubscribe?.();
    } catch {}
  });
</script>

<PanelFrame title="Activity" loading={loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button class="retry-button" on:click={loadInitial}>Retry</button>
    </div>
  {:else if items.length === 0}
    <div class="empty-state">No recent activity.</div>
  {:else}
    <ol class="timeline" aria-live="polite">
      {#each items as ev}
        <li class="timeline-item">
          <span class="timeline-dot" aria-hidden="true">{icon(ev.type)}</span>
          <div class="event-card">
            <div class="event-header">
              <div class="event-text">
                <div class="message" title={ev.message}>{ev.message}</div>
                <div class="type" title={ev.type}>{ev.type}</div>
              </div>
              <div class="timestamp">{new Date(ev.created_at).toLocaleString()}</div>
            </div>
          </div>
        </li>
      {/each}
    </ol>
    {#if !endReached}
      <div class="load-more">
        <button class="load-more-button" on:click={loadMore}>Load more</button>
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
    font-size: 0.95rem;
  }

  .timeline {
    position: relative;
    margin-top: 0.5rem;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    padding-left: 1.25rem;
    list-style: none;
    display: grid;
    gap: 1rem;
  }

  .timeline-item {
    position: relative;
  }

  .timeline-dot {
    position: absolute;
    left: -0.8rem;
    top: 0.35rem;
    height: 1.1rem;
    width: 1.1rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(34, 211, 238, 0.8));
    display: grid;
    place-items: center;
    font-size: 0.65rem;
    color: rgba(12, 16, 32, 0.92);
    box-shadow: 0 4px 12px rgba(34, 211, 238, 0.25);
  }

  .event-card {
    border-radius: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.75rem;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .event-card:hover {
    background: rgba(255, 255, 255, 0.07);
    transform: translateY(-1px);
  }

  .event-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .event-text {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  .message {
    font-size: 0.98rem;
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: 0.78rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timestamp {
    font-size: 0.72rem;
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
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    transition: color 0.2s ease;
  }

  .load-more-button:hover,
  .load-more-button:focus-visible {
    color: #ffffff;
  }

  .skeleton {
    display: grid;
    gap: 0.65rem;
  }

  .skeleton-row {
    height: 2.65rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.08);
    animation: pulse 1.2s ease-in-out infinite;
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
    .event-card,
    .skeleton-row {
      transition: none;
      animation: none;
    }
  }
</style>
