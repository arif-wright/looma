<script lang="ts">
  import { onDestroy } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  type FollowListKind = 'followers' | 'following';

  export let open = false;
  export let userId: string | null = null;
  export let kind: FollowListKind = 'followers';
  export let onClose: () => void = () => {};

  type FollowEntry = {
    user_id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
  };

  const PAGE_SIZE = 20;

  let items: FollowEntry[] = [];
  let loading = false;
  let errorMessage = '';
  let nextOffset: number | null = 0;
  let observer: IntersectionObserver | null = null;
  let sentinel: HTMLDivElement | null = null;
  let currentKey = '';
  let titleLabel = 'Followers';

  const formatRelative = (iso: string) => {
    const timestamp = Date.parse(iso);
    if (Number.isNaN(timestamp)) return '';
    const diffMs = Date.now() - timestamp;
    const minute = 60 * 1000;
    const hour = minute * 60;
    const day = hour * 24;
    if (diffMs < hour) {
      const minutes = Math.max(1, Math.round(diffMs / minute));
      return `${minutes}m ago`;
    }
    if (diffMs < day) {
      const hours = Math.max(1, Math.round(diffMs / hour));
      return `${hours}h ago`;
    }
    const days = Math.max(1, Math.round(diffMs / day));
    if (days < 30) {
      return `${days}d ago`;
    }
    const months = Math.max(1, Math.round(days / 30));
    if (months < 12) {
      return `${months}mo ago`;
    }
    const years = Math.max(1, Math.round(months / 12));
    return `${years}y ago`;
  };

  function resetState() {
    items = [];
    errorMessage = '';
    nextOffset = 0;
  }

  async function loadMore(initial = false) {
    if (!open || loading) return;
    if (nextOffset === null && !initial) return;
    if (!userId) {
      errorMessage = 'Missing user context';
      return;
    }

    loading = true;
    const endpoint = kind === 'followers' ? '/api/followers' : '/api/following';
    const params = new URLSearchParams({
      userId,
      limit: String(PAGE_SIZE),
      offset: String(nextOffset ?? 0)
    });

    try {
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }

      const payload = await res.json();
      const received = Array.isArray(payload.items) ? (payload.items as FollowEntry[]) : [];
      items = initial ? received : [...items, ...received];
      nextOffset = typeof payload.nextOffset === 'number' ? payload.nextOffset : null;
      errorMessage = '';
    } catch (err) {
      console.error('[FollowListModal] fetch failed', err);
      errorMessage = 'Unable to load list right now';
      nextOffset = null;
    } finally {
      loading = false;
    }
  }

  $: modalKey = open ? `${kind}:${userId ?? ''}` : '';
  $: if (modalKey !== currentKey) {
    currentKey = modalKey;
    resetState();
    if (open && userId) {
      void loadMore(true);
    }
  }

  $: if (sentinel) {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      if (!open) return;
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: '160px' });
    observer.observe(sentinel);
  } else if (!sentinel && observer) {
    observer.disconnect();
  }

  onDestroy(() => {
    observer?.disconnect();
  });

  $: titleLabel = kind === 'followers' ? 'Followers' : 'Following';
</script>

<Modal {open} title={titleLabel} {onClose}>
  {#if !userId}
    <p class="empty-state">Unable to load this list.</p>
  {:else}
    {#if items.length === 0 && loading}
      <p class="empty-state">Loading {titleLabel.toLowerCase()}…</p>
    {:else if items.length === 0}
      <p class="empty-state">No {titleLabel.toLowerCase()} yet.</p>
    {/if}

    {#if errorMessage}
      <p class="error-state">{errorMessage}</p>
    {/if}

    <ul class="follow-list" role="list">
      {#each items as item}
        <li class="follow-row">
          <div class="follow-avatar">
            <img src={item.avatar_url ?? '/avatars/default.png'} alt="" loading="lazy" />
          </div>
          <div class="follow-details">
            <div class="follow-name">{item.display_name ?? item.handle ?? 'Explorer'}</div>
            <div class="follow-meta">
              {#if item.handle}
                <span>@{item.handle}</span>
              {/if}
              {#if item.created_at}
                <span aria-hidden="true">•</span>
                <span>{formatRelative(item.created_at)}</span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>

    <div bind:this={sentinel}></div>

    {#if loading && items.length > 0}
      <p class="loading-more">Loading more…</p>
    {/if}
  {/if}
</Modal>

<style>
  .follow-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .follow-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }

  .follow-avatar img {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
  }

  .follow-details {
    flex: 1;
    min-width: 0;
  }

  .follow-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: white;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .follow-meta {
    display: flex;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .empty-state,
  .error-state,
  .loading-more {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
    margin: 0.5rem 0 1rem;
  }

  .error-state {
    color: #f87171;
  }
</style>
