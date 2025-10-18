<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';

  type Row = { id: string; type: string; message: string; created_at: string };

  let loading = true;
  let error: string | null = null;
  let items: Row[] = [];
  let page = 0;
  const PAGE_SIZE = 6;
  let endReached = false;
  let userId: string | null = null;
  let channel: any;
  let currentPage = 1;
  let loadingMore = false;
  let listEl: HTMLOListElement | null = null;

  const perPage = PAGE_SIZE;

  $: totalPages = Math.ceil(Math.max(items.length, 1) / perPage);
  $: if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  $: paginated = items.slice((currentPage - 1) * perPage, currentPage * perPage);

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

    const incoming = (data as Row[]) ?? [];
    items = reset ? incoming : [...items, ...incoming];
    if (reset) {
      endReached = incoming.length < PAGE_SIZE;
    } else if (incoming.length < PAGE_SIZE) {
      endReached = true;
    }

    if (!channel) {
      channel = supabase
        .channel('events-rt')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` },
          (payload) => {
            items = [payload.new as Row, ...items];
            currentPage = 1;
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
    currentPage = 1;
    try {
      await fetchPage(true);
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
    }
    loading = false;
  }

  async function loadNextChunk() {
    if (endReached || loadingMore) return false;
    loadingMore = true;
    page += 1;
    try {
      await fetchPage();
      return true;
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
      page = Math.max(0, page - 1);
      return false;
    } finally {
      loadingMore = false;
    }
  }

  async function nextPage() {
    const nextIndex = currentPage + 1;
    const loadedPages = Math.max(1, Math.ceil(items.length / perPage));
    if (nextIndex <= loadedPages) {
      currentPage = nextIndex;
      scrollToTop();
      return;
    }
    if (!endReached) {
      const loaded = await loadNextChunk();
      if (loaded) {
        currentPage = Math.min(nextIndex, Math.max(1, Math.ceil(items.length / perPage)));
        scrollToTop();
      }
    }
  }

  function prevPage() {
    if (currentPage > 1) {
      currentPage -= 1;
      scrollToTop();
    }
  }

  function scrollToTop() {
    listEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <ol class="timeline" aria-live="polite" bind:this={listEl}>
      {#each paginated as ev}
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
    {#if totalPages > 1 || !endReached}
      <div class="pagination">
        <button
          type="button"
          class="pagination-button"
          on:click={prevPage}
          disabled={currentPage === 1}
        >
          ← Prev
        </button>
        <div class="page-indicator">Page {currentPage} / {totalPages}</div>
        <button
          type="button"
          class="pagination-button"
          on:click={nextPage}
          disabled={loadingMore || (endReached && currentPage === totalPages)}
        >
          Next →
        </button>
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

  .pagination {
    margin-top: 1rem;
    padding: 0 0.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .pagination-button {
    font-size: 0.85rem;
    padding: 0.35rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .pagination-button:hover:not(:disabled),
  .pagination-button:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }

  .pagination-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .page-indicator {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  @media (max-width: 480px) {
    .pagination {
      flex-direction: column;
      align-items: stretch;
    }

    .pagination-button {
      width: 100%;
      text-align: center;
    }
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
