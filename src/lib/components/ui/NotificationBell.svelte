<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount, tick } from 'svelte';
  import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import { relativeTime } from '$lib/social/commentHelpers';
  import { canonicalCommentPath, canonicalPostPath, commentHash } from '$lib/threads/permalink';
  import { achievementsUI } from '$lib/achievements/store';
  import type { NotificationItem } from './types';

  export let notifications: NotificationItem[] = [];
  export let unreadCount = 0;
  export let compact = false;
  export let open = false;
  export let onToggle: (() => void) | null = null;
  export let className = '';
  export { className as class };

  type ToastState = { kind: 'success'; message: string } | null;

  const seenIds = new Set<string>();

  let items: NotificationItem[] = notifications.map(normalizeItem);
  let lastNotificationsRef = notifications;
  syncSeenIds(items);

  let unread = unreadCount;
  let anchor: HTMLButtonElement | null = null;
  let listEl: HTMLElement | null = null;
  let liveMessage: string | null = null;
  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast: ToastState = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let supabase: ReturnType<typeof supabaseBrowser> | null = null;
  let channel: RealtimeChannel | null = null;
  let realtimeRetryTimer: ReturnType<typeof setTimeout> | null = null;

  $: if (notifications !== lastNotificationsRef) {
    lastNotificationsRef = notifications;
    items = notifications.map(normalizeItem);
    syncSeenIds(items);
  }

  $: unread = items.filter((item) => !item.read).length;

  function normalizeItem(item: NotificationItem): NotificationItem {
    return {
      ...item,
      metadata: (item.metadata ?? {}) as Record<string, unknown>
    };
  }

  function syncSeenIds(next: NotificationItem[]) {
    next.forEach((item) => seenIds.add(item.id));
  }

  function describe(item: NotificationItem): string {
    const payload = item.metadata ?? {};
    switch (item.kind) {
      case 'reaction': {
        const reaction = typeof payload.reaction === 'string' ? payload.reaction : 'reaction';
        const scope = item.target_kind === 'comment' ? 'your comment' : 'your post';
        return `Someone reacted (${reaction}) to ${scope}`;
      }
      case 'comment': {
        const scope = payload.isReply ? 'your comment' : 'your post';
        return `New comment on ${scope}`;
      }
      case 'share':
        return 'Someone shared your post';
      case 'achievement_unlocked': {
        const name = getMetaString(payload, 'name', 'achievementName', 'title');
        return name ? `Achievement unlocked: ${name}` : 'Achievement unlocked';
      }
      case 'companion_nudge': {
        const name = getMetaString(payload, 'companionName', 'companion_name') ?? 'Your companion';
        const reason = getMetaString(payload, 'reason');
        if (reason === 'low_energy') return `${name} is low on energy`;
        if (reason === 'care_due') return `${name} is ready for care`;
        return `${name} has a new update`;
      }
      case 'event_reminder': {
        const title = getMetaString(payload, 'title', 'eventTitle');
        return title ? `${title} starts soon` : 'Event reminder';
      }
      default:
        return 'You have an update';
    }
  }

  function getMetaString(
    meta: Record<string, unknown> | null | undefined,
    ...keys: string[]
  ): string | null {
    if (!meta) return null;
    for (const key of keys) {
      const candidate = meta[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  }

  function resolveHref(item: NotificationItem): string | null {
    const meta = item.metadata ?? {};
    const postId =
      getMetaString(meta, 'postId', 'post_id', 'postID') ??
      (item.target_kind === 'post' ? item.target_id : null);
    const commentId =
      getMetaString(meta, 'commentId', 'comment_id', 'commentID') ??
      (item.target_kind === 'comment' ? item.target_id : null);
    const parentId = getMetaString(meta, 'parentCommentId', 'parent_comment_id');
    const postHandle = getMetaString(meta, 'postHandle', 'post_handle', 'authorHandle', 'author_handle');
    const postSlug = getMetaString(meta, 'postSlug', 'post_slug', 'slug');

    if (postId && commentId) {
      return canonicalCommentPath(postHandle, postSlug, postId, commentId);
    }

    if (postId && parentId) {
      return `${canonicalPostPath(postHandle, postSlug, postId)}${commentHash(parentId)}`;
    }

    if (postId) {
      return canonicalPostPath(postHandle, postSlug, postId);
    }

    if (item.target_kind === 'companion') {
      return `/app/companions?focus=${item.target_id}`;
    }

    if (item.target_kind === 'event') {
      const eventId = getMetaString(meta, 'eventId', 'event_id') ?? item.target_id;
      return `/app/events?eventId=${encodeURIComponent(eventId)}`;
    }

    return null;
  }

  function handleNavigate(event: MouseEvent, item: NotificationItem, href: string | null) {
    if (item.kind === 'achievement_unlocked') {
      event.preventDefault();
      closeDropdown();
      const meta = item.metadata ?? {};
      const key = getMetaString(meta, 'key', 'achievementKey');
      const slug = getMetaString(meta, 'slug', 'gameSlug');
      const gameId = getMetaString(meta, 'gameId', 'game_id');
      if (key) {
        achievementsUI.focusAchievement(key, {
          slug: slug ?? null,
          gameId: gameId ?? null,
          source: 'notification'
        });
      } else {
        achievementsUI.open({ slug: slug ?? null, gameId: gameId ?? null, source: 'notification' });
      }
      return;
    }

    if (!href) {
      event.preventDefault();
      return;
    }

    const isModified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

    if (isModified) {
      closeDropdown();
      return;
    }

    event.preventDefault();
    closeDropdown();
    void goto(href);
  }

  function extractActorDisplay(item: NotificationItem): string | null {
    const payload = item.metadata ?? {};
    if (typeof payload.actorDisplay === 'string' && payload.actorDisplay.trim().length > 0) {
      return payload.actorDisplay;
    }
    if (typeof payload.actor_display === 'string' && payload.actor_display.trim().length > 0) {
      return payload.actor_display;
    }
    return null;
  }

  function setLiveAnnouncement(message: string, duration = 1800) {
    liveMessage = message;
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      liveMessage = null;
      liveTimer = null;
    }, duration);
  }

  function showToast(message: string) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { kind: 'success', message };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3500);
  }

  function closeDropdown() {
    open = false;
  }

  function toggleDropdown() {
    open = !open;
    syncDocumentHandlers();
    if (open) {
      void refresh();
    }
  }

  function syncDocumentHandlers() {
    if (typeof document === 'undefined') return;
    if (open) {
      document.addEventListener('click', handleDocumentClick, true);
      document.addEventListener('keydown', handleKey, true);
    } else {
      document.removeEventListener('click', handleDocumentClick, true);
      document.removeEventListener('keydown', handleKey, true);
    }
  }

  async function refresh() {
    try {
      const previousScroll = open && listEl ? { top: listEl.scrollTop, height: listEl.scrollHeight } : null;
      const response = await fetch('/api/notifications');
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload.items)) {
        const nextItems: NotificationItem[] = (payload.items as NotificationItem[])
          .slice(0, 20)
          .map((item) => normalizeItem(item));
        items = nextItems;
        syncSeenIds(nextItems);
        const fallbackUnread = nextItems.filter((item: NotificationItem) => !item.read).length;
        unread = Number(payload.unread ?? fallbackUnread);
        if (previousScroll && listEl) {
          const delta = listEl.scrollHeight - previousScroll.height;
          if (delta !== 0) {
            listEl.scrollTop = Math.max(previousScroll.top + delta, 0);
          }
        }
      }
    } catch (err) {
      console.error('[NotificationBell] refresh failed', err);
    }
  }

  async function markAllRead() {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all' })
      });
      if (!response.ok) return;
      items = items.map((item) => ({ ...item, read: true }));
      unread = 0;
      setLiveAnnouncement('Notifications marked as read', 1500);
    } catch (err) {
      console.error('[NotificationBell] markAllRead failed', err);
    }
  }

  function handleDocumentClick(event: MouseEvent) {
    if (!open) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (anchor?.contains(target) || listEl?.contains(target)) return;
    closeDropdown();
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDropdown();
      anchor?.focus();
    }
  }

  onMount(() => {
    supabase = supabaseBrowser();
    void initRealtime();
    syncDocumentHandlers();
  });

  onDestroy(() => {
    void teardownChannel();
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (liveTimer) {
      clearTimeout(liveTimer);
      liveTimer = null;
    }
    if (realtimeRetryTimer) {
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = null;
    }

    if (typeof document === 'undefined') return;
    if (typeof document === 'undefined') return;
    document.removeEventListener('click', handleDocumentClick, true);
    document.removeEventListener('keydown', handleKey, true);
  });

  async function handleRealtimeInsert(record: NotificationItem) {
    if (!record?.id || seenIds.has(record.id)) {
      return;
    }

    const incoming = normalizeItem(record);
    seenIds.add(incoming.id);

    const maintainScroll = open && listEl && listEl.scrollTop > 0;
    const previousHeight = maintainScroll && listEl ? listEl.scrollHeight : 0;

    const nextItems = [incoming, ...items.filter((item) => item.id !== incoming.id)].slice(0, 20);
    items = nextItems;
    syncSeenIds(nextItems);

    if (maintainScroll && listEl) {
      await tick();
      const delta = listEl.scrollHeight - previousHeight;
      if (delta > 0) {
        listEl.scrollTop += delta;
      }
    }

    const actorDisplay = extractActorDisplay(incoming);
    const message = actorDisplay ? `New notification from ${actorDisplay}` : 'New notification';
    setLiveAnnouncement(message, 2000);
    showToast(message);
  }

  function scheduleRealtimeRetry() {
    if (realtimeRetryTimer) return;
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = null;
      void initRealtime();
    }, 3000);
  }

  async function teardownChannel() {
    if (!channel || !supabase) return;
    try {
      await supabase.removeChannel(channel);
    } catch (err) {
      console.error('[NotificationBell] failed to remove realtime channel', err);
    }
    channel = null;
  }

  async function initRealtime() {
    if (!supabase) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      await teardownChannel();

      const newChannel = supabase
        .channel(`notifs:${userId}`, {
          config: {
            broadcast: { ack: true },
            presence: { key: userId }
          }
        })
        .on<RealtimePostgresChangesPayload<NotificationItem>>(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          async (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
              const inserted = payload.new as unknown as NotificationItem;
              if (inserted && typeof inserted.id === 'string') {
                await handleRealtimeInsert(inserted);
              }
              return;
            }

            if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
              await refresh();
            }
          }
        );

      newChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (realtimeRetryTimer) {
            clearTimeout(realtimeRetryTimer);
            realtimeRetryTimer = null;
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error('[NotificationBell] realtime channel issue', status);
          scheduleRealtimeRetry();
        }
      });

      channel = newChannel;
    } catch (err) {
      console.error('[NotificationBell] realtime setup failed', err);
      scheduleRealtimeRetry();
    }
  }
</script>

<div class={`notification-wrapper ${className}`.trim()} {...$$restProps}>
  <button
    bind:this={anchor}
    type="button"
    class={`bell ${compact ? 'bell--compact' : 'pill'} ${unread > 0 ? 'has-unread' : ''} ${
      open ? 'is-open' : ''
    }`}
    aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
    on:click={() => (onToggle ? onToggle() : toggleDropdown())}
    data-testid="notification-bell"
    aria-expanded={open ? 'true' : 'false'}
    aria-haspopup="dialog"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-4.5a7 7 0 0 0-5-6.72V4a2 2 0 1 0-4 0v.78a7 7 0 0 0-5 6.72V16l-1.9 1.9A1 1 0 0 0 4 20h16a1 1 0 0 0 .7-1.7Z"
      />
    </svg>
    {#if unread > 0}
      <span
        class="badge"
        data-testid="notification-badge"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {unread > 9 ? '9+' : unread}
      </span>
    {/if}
    <span class={`glow ${unread > 0 ? 'active' : ''}`} aria-hidden="true"></span>
  </button>

  {#if open}
    <div
      bind:this={listEl}
      class={`dropdown ${compact ? 'dropdown--compact' : ''}`}
      role="dialog"
      aria-label="Notifications"
      data-testid="notification-dropdown"
      tabindex="-1"
    >
      <header>
        <div>
          <p class="title">Notifications</p>
          <p class="subtitle">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        <button
          type="button"
          class="mark-read"
          data-testid="notification-mark-all"
          on:click={markAllRead}
          disabled={unread === 0}
        >
          Mark all as read
        </button>
      </header>

      <ul data-testid="notification-list">
        {#if items.length === 0}
          <li class="empty" aria-live="polite">Nothing to show yet.</li>
        {:else}
          {#each items as item (item.id)}
            {@const href = resolveHref(item)}
            <li
              class={`item ${item.read ? '' : 'unread'}`}
              data-testid="notification-item"
              data-unread={item.read ? 'false' : 'true'}
              data-notification-id={item.id}
              role="presentation"
            >
              <a
                class="item-link"
                href={href ?? '#'}
                role="menuitem"
                aria-disabled={href ? undefined : 'true'}
                tabindex={href ? undefined : -1}
                on:click={(event) => handleNavigate(event, item, href)}
              >
                <div class="indicator" aria-hidden="true"></div>
                <div class="copy">
                  <p class="message">{describe(item)}</p>
                  <time datetime={item.created_at}>{relativeTime(item.created_at)}</time>
                </div>
              </a>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}

  {#if toast}
    <div
      class={`notification-toast ${toast.kind}`}
      role="status"
      aria-live="polite"
      data-testid="toast-success"
    >
      {toast.message}
    </div>
  {/if}

  <div class="live-region" aria-live="polite">
    {#if liveMessage}
      {liveMessage}
    {/if}
  </div>
</div>

<style>
  .notification-wrapper {
    position: relative;
    z-index: 2147483646;
  }

  :global(:root) {
    --pill-h: 36px;
    --pill-px: 10px;
    --pill-bg: #0f141f;
    --pill-bg-hover: #161c29;
  }

  .bell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--pill-h);
    height: var(--pill-h);
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--pill-bg);
    color: rgba(226, 232, 240, 0.92);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 150ms ease;
  }

  .bell svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }

  .bell:hover,
  .bell:focus-visible,
  .bell.is-open {
    border-color: rgba(56, 189, 248, 0.5);
    background: var(--pill-bg-hover);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
    transform: translateY(-1px);
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -2px;
    min-width: 20px;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(248, 113, 113, 0.92);
    color: #0f172a;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .glow {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.25), transparent 60%);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .glow.active {
    opacity: 1;
    animation: pulse 1.8s ease-in-out infinite;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;
    width: min(320px, 92vw);
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 18px;
    box-shadow: 0 24px 55px rgba(2, 6, 23, 0.55);
    padding: 16px;
    display: grid;
    gap: 10px;
    z-index: 999;
    backdrop-filter: blur(14px);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    margin: 0;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .mark-read {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: transparent;
    color: rgba(226, 232, 240, 0.92);
    padding: 6px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .mark-read:hover:not(:disabled),
  .mark-read:focus-visible:not(:disabled) {
    background: rgba(56, 189, 248, 0.18);
    color: rgba(15, 23, 42, 0.92);
  }

  .mark-read:disabled {
    opacity: 0.6;
    cursor: default;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    max-height: 320px;
    overflow-y: auto;
  }

  .empty {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.82);
    text-align: center;
    padding: 24px 0;
  }

  .item {
    border-radius: 14px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(23, 37, 84, 0.88);
    transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
  }

  .item.unread {
    border: 1px solid rgba(56, 189, 248, 0.35);
    background: rgba(30, 64, 175, 0.3);
  }

  .indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-top: 6px;
    background: rgba(56, 189, 248, 0.5);
  }

  .item.unread .indicator {
    background: rgba(56, 189, 248, 0.95);
  }

  .item-link {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    padding: 10px 12px;
    border-radius: inherit;
    text-decoration: none;
    color: inherit;
    outline: none;
  }

  .item-link:hover,
  .item-link:focus-visible {
    background: rgba(56, 189, 248, 0.08);
  }

  .item-link[aria-disabled='true'] {
    cursor: default;
    opacity: 0.6;
    pointer-events: none;
  }

  .copy {
    display: grid;
    gap: 4px;
  }

  .message {
    margin: 0;
    font-size: 0.85rem;
  }

  time {
    font-size: 0.72rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .live-region {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .notification-toast {
    position: absolute;
    top: calc(100% + 16px);
    right: 0;
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.92);
    color: rgba(226, 232, 240, 0.94);
    border: 1px solid rgba(56, 189, 248, 0.35);
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.35);
    font-size: 0.82rem;
    z-index: 45;
    animation: toast-pop 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .glow,
    .glow.active {
      animation: none;
      transition: none;
    }

    .notification-toast {
      animation: none;
    }

    .item {
      transition: none;
    }

    .item-link {
      transition: none;
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.8;
    }
  }

  @keyframes toast-pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
