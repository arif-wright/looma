<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';

  type FeedRow = {
    id: string;
    created_at: string;
    type: string;
    message: string;
    meta: any;
    user_id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };

  const PAGE_SIZE = 5;
  let items: FeedRow[] = [];
  let loading = true;
  let moreLoading = false;
  let reachedEnd = false;
  let errMsg: string | null = null;
  const supabase = supabaseBrowser();

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

  async function loadInitial() {
    loading = true;
    reachedEnd = false;
    errMsg = null;
    try {
      const { data, error } = await supabase.rpc('get_public_feed', { p_limit: PAGE_SIZE });
      if (error) throw error;
      if (Array.isArray(data)) {
        items = data as FeedRow[];
        reachedEnd = data.length < PAGE_SIZE;
      } else {
        items = [];
        reachedEnd = true;
      }
    } catch (err) {
      console.error('load social feed error', err);
      items = [];
      reachedEnd = true;
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (moreLoading || reachedEnd || items.length === 0) return;
    moreLoading = true;
    errMsg = null;
    const last = items[items.length - 1];
    try {
      const { data, error } = await supabase.rpc('get_public_feed', {
        p_limit: PAGE_SIZE,
        p_before: last.created_at
      });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        const existing = new Set(items.map((row) => row.id));
        const additions = (data as FeedRow[]).filter((row) => !existing.has(row.id));
        items = [...items, ...additions];
        if (data.length < PAGE_SIZE) reachedEnd = true;
      } else {
        reachedEnd = true;
      }
    } catch (err) {
      console.error('load more social feed error', err);
      reachedEnd = true;
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      moreLoading = false;
    }
  }

  let sending = new Set<string>();
  function setSending(userId: string, active: boolean) {
    const next = new Set(sending);
    if (active) next.add(userId);
    else next.delete(userId);
    sending = next;
  }

  async function sendEnergy(targetUserId: string) {
    setSending(targetUserId, true);
    try {
      const res = await fetch('/api/energy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: targetUserId, amount: 1 })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        console.error('send energy failed', payload?.error ?? res.statusText);
      }
    } catch (err) {
      console.error('send energy request error', err);
    } finally {
      setSending(targetUserId, false);
    }
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;

  onMount(async () => {
    await loadInitial();
    channel = supabase
      .channel('social-feed-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
        const row = payload.new as any;
        if (!row?.is_public) return;
        if (items.some((item) => item.id === row.id)) return;
        const prepend: FeedRow = {
          id: row.id,
          created_at: row.created_at,
          type: row.type,
          message: row.message,
          meta: row.meta,
          user_id: row.user_id,
          display_name: row.display_name ?? null,
          handle: row.handle ?? null,
          avatar_url: row.avatar_url ?? null
        };
        items = [prepend, ...items];
        reachedEnd = false;
      })
      .subscribe();
  });

  onDestroy(() => {
    if (channel) supabase.removeChannel(channel);
  });
</script>

<div class="panel">
  <h3 class="panel-title">Social Feed</h3>

  {#if loading}
    <div class="panel-message">Loading…</div>
  {:else if errMsg}
    <div class="panel-message error">Error: {errMsg}</div>
  {:else if items.length === 0}
    <div class="panel-message">No public activity yet.</div>
  {:else}
    <ul class="feed" aria-live="polite">
      {#each items as row (row.id)}
        <li class="feed-item">
          <img class="avatar" src={row.avatar_url ?? '/avatar-fallback.png'} alt="" loading="lazy" />
          <div class="body">
            <div class="header">
              <span class="name">{row.display_name ?? row.handle ?? 'Someone'}</span>
              <span class="dot" aria-hidden="true">•</span>
              <span class="when">{relativeTime(row.created_at)}</span>
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
    <div class="load-more">
      {#if reachedEnd}
        <span class="end-text">End of feed</span>
      {:else}
        <button class="more-button" on:click={loadMore} disabled={moreLoading}>
          {moreLoading ? 'Loading…' : 'Load more'}
        </button>
      {/if}
    </div>
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

  .panel-message.error {
    color: #fca5a5;
    opacity: 1;
  }

  .feed {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  .feed-item {
    display: flex;
    gap: 0.85rem;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.12);
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.04);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 0.4rem;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
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
    opacity: 0.92;
  }

  .actions {
    margin-top: 0.3rem;
  }

  .energy {
    font-size: 0.75rem;
    padding: 0.35rem 0.85rem;
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
    opacity: 0.45;
    cursor: default;
  }

  .load-more {
    padding: 0.75rem 1rem 1rem;
    display: flex;
    justify-content: center;
  }

  .more-button {
    font-size: 0.75rem;
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .more-button:hover:not(:disabled),
  .more-button:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .more-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .end-text {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel,
    .energy,
    .more-button {
      transition: none;
    }
  }
</style>
