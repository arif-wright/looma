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
        reachedEnd = data.length < PAGE_SIZE;
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

  function spawnSparks(button: HTMLButtonElement | null) {
    if (!button) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'spark-wrap';
    const palette = ['#6cf', '#f0f', '#0ff', '#9ff', '#f9f'];
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement('span');
      spark.className = 'spark-p';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const radius = 12 + Math.random() * 6;
      spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
      spark.style.setProperty('--clr', palette[i % palette.length]);
      wrapper.appendChild(spark);
    }
    button.appendChild(wrapper);
    setTimeout(() => wrapper.remove(), 520);
  }

  function handleSendEnergy(button: HTMLButtonElement, targetUserId: string) {
    if (sending.has(targetUserId)) return;
    spawnSparks(button);
    void sendEnergy(targetUserId);
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
        <li class="item">
          <img class="avatar" src={row.avatar_url ?? '/avatar-fallback.png'} alt="" loading="lazy" />
          <div class="content">
            <div class="header">
              <div class="meta">
                <span class="name">{row.display_name ?? row.handle ?? 'Someone'}</span>
                <span class="dot" aria-hidden="true">•</span>
                <span class="when">{relativeTime(row.created_at)}</span>
              </div>
              <button
                type="button"
                class="energy"
                disabled={sending.has(row.user_id)}
                on:click={(event) => handleSendEnergy(event.currentTarget as HTMLButtonElement, row.user_id)}
              >
                ⚡ Send Energy
              </button>
            </div>
            <div class="message">{row.message}</div>
          </div>
        </li>
      {/each}
    </ul>
    <div class="footer">
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
  }

  .panel-title {
    font-weight: 600;
    padding: 14px 16px;
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
  }

  .item {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .item:last-child {
    border-bottom: none;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
  }

  .content {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .meta {
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
    font-size: 0.82rem;
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
    font-size: 0.88rem;
    line-height: 1.32;
    opacity: 0.9;
    margin-top: 0.2rem;
  }

  .energy {
    font-size: 0.72rem;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition:
      background 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease,
      opacity 0.2s ease,
      transform 0.1s ease;
  }

  .energy:hover:enabled,
  .energy:focus-visible:enabled {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(0, 255, 255, 0.35);
    box-shadow:
      0 0 6px rgba(0, 255, 255, 0.3),
      0 0 12px rgba(255, 0, 255, 0.2);
  }

  .energy:active:enabled {
    transform: scale(0.96);
    box-shadow:
      0 0 10px rgba(255, 0, 255, 0.4),
      0 0 20px rgba(0, 255, 255, 0.35);
  }

  .energy:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  .spark-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .spark-p {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: var(--clr, #6cf);
    filter: drop-shadow(0 0 6px var(--clr, #6cf));
    transform: translate(-50%, -50%) scale(0.6);
    animation: spark-pop 0.52s ease-out forwards;
  }

  @keyframes spark-pop {
    0% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.65);
    }
    60% {
      opacity: 1;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.9);
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0);
    }
  }

  .footer {
    padding: 0.75rem 1rem 1rem;
    display: flex;
    justify-content: center;
  }

  .more-button {
    font-size: 0.72rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
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
    font-size: 0.72rem;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .energy,
    .more-button,
    .actions {
      transition: none;
    }
    .spark-p {
      animation: none;
      opacity: 0;
    }
  }
</style>
