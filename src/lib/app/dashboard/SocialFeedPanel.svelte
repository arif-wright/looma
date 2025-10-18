<script lang="ts">
  import { onMount } from 'svelte';
  import Pagination from '$lib/ui/Pagination.svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';

  type FeedRow = {
    id: string;
    created_at: string;
    type: string;
    message: string;
    meta: any;
    is_public: boolean;
    user_id: string;
    display_name: string | null;
  };

  const perPage = 8;

  let items: FeedRow[] = [];
  let loading = true;
  let page = 1;
  let container: HTMLDivElement | null = null;

  $: pages = Math.max(1, Math.ceil(items.length / perPage));
  $: pageItems = items.slice((page - 1) * perPage, page * perPage);

  const supabase = supabaseBrowser();

  async function loadFeed() {
    loading = true;
    try {
      const { data, error } = await supabase.rpc('get_public_feed', { p_limit: 200 });
      if (error) throw error;
      if (Array.isArray(data)) {
        items = data as FeedRow[];
      }
    } catch (err) {
      console.error('Failed to load social feed', err);
      items = [];
    } finally {
      loading = false;
    }
  }

  function setPage(p: number) {
    page = Math.min(Math.max(1, p), pages);
    container?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let sending = new Set<string>();

  function markSending(id: string, active: boolean) {
    const next = new Set(sending);
    if (active) {
      next.add(id);
    } else {
      next.delete(id);
    }
    sending = next;
  }

  async function sendEnergy(targetUserId: string) {
    markSending(targetUserId, true);
    try {
      const response = await fetch('/api/energy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: targetUserId, amount: 1 })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.error('Send energy failed', payload?.error ?? response.statusText);
      }
    } catch (err) {
      console.error('Send energy request error', err);
    } finally {
      markSending(targetUserId, false);
    }
  }

  onMount(loadFeed);
</script>

<div class="panel" bind:this={container}>
  <h3 class="panel-title">Social Feed</h3>

  {#if loading}
    <div class="panel-message">Loading…</div>
  {:else if items.length === 0}
    <div class="panel-message">No public activity yet.</div>
  {:else}
    <ul class="feed" aria-live="polite">
      {#each pageItems as row (row.id)}
        <li class="feed-item">
          <div class="marker" aria-hidden="true"></div>
          <div class="body">
            <div class="header">
              <span class="name">{row.display_name ?? 'Someone'}</span>
              <span aria-hidden="true" class="dot">•</span>
              <span class="when">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <div class="message">{row.message}</div>
            <div class="actions">
              <button
                type="button"
                class="energy"
                disabled={sending.has(row.user_id)}
                on:click={() => sendEnergy(row.user_id)}
              >
                ⚡ Send Energy
              </button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if pages > 1}
      <Pagination {page} {pages} onChange={setPage} ariaLabel="Global feed pagination" />
    {/if}
  {/if}
</div>

<style>
  .panel {
    position: relative;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    max-height: 100%;
    overflow: auto;
  }

  .panel-title {
    font-weight: 600;
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .panel-message {
    padding: 1rem 1.5rem;
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .feed {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .feed-item {
    display: flex;
    gap: 0.65rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .marker {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    margin-top: 0.4rem;
    background: linear-gradient(180deg, #a78bfa, #22d3ee);
    flex-shrink: 0;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }

  .header {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    font-size: 0.85rem;
  }

  .name {
    font-weight: 600;
  }

  .dot {
    opacity: 0.5;
  }

  .when {
    font-size: 0.72rem;
    opacity: 0.65;
  }

  .message {
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .actions {
    margin-top: 0.25rem;
  }

  .energy {
    font-size: 0.75rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  }

  .energy:hover:enabled,
  .energy:focus-visible:enabled {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .energy:disabled {
    cursor: default;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel,
    .energy {
      transition: none;
    }
  }
</style>
