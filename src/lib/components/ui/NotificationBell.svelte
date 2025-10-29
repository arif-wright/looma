<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { relativeTime } from '$lib/social/commentHelpers';

  export type NotificationItem = {
    id: string;
    user_id: string;
    actor_id: string | null;
    kind: 'reaction' | 'comment' | 'share';
    target_id: string;
    target_kind: 'post' | 'comment';
    created_at: string;
    read: boolean;
    metadata: Record<string, unknown> | null;
  };

  export let notifications: NotificationItem[] = [];
  export let unreadCount = 0;

  let items: NotificationItem[] = [...notifications];
  let unread = unreadCount;
  let open = false;
  let anchor: HTMLButtonElement | null = null;
  let listEl: HTMLElement | null = null;
  let liveMessage: string | null = null;

  $: items = notifications.map((item) => ({ ...item }));
  $: unread = items.filter((item) => !item.read).length;

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
      default:
        return 'You have an update';
    }
  }

  function closeDropdown() {
    open = false;
  }

  function toggleDropdown() {
    open = !open;
    if (open) {
      void refresh();
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload.items)) {
        items = payload.items.slice(0, 20);
        unread = Number(payload.unread ?? items.filter((item) => !item.read).length);
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
      liveMessage = 'Notifications marked as read';
      setTimeout(() => (liveMessage = null), 1500);
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
    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleKey, true);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleDocumentClick, true);
    document.removeEventListener('keydown', handleKey, true);
  });
</script>

<div class="notification-wrapper">
  <button
    bind:this={anchor}
    type="button"
    class={`bell ${unread > 0 ? 'has-unread' : ''} ${open ? 'is-open' : ''}`}
    aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
    on:click={toggleDropdown}
    data-testid="notification-bell"
    aria-expanded={open ? 'true' : 'false'}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-4.5a7 7 0 0 0-5-6.72V4a2 2 0 1 0-4 0v.78a7 7 0 0 0-5 6.72V16l-1.9 1.9A1 1 0 0 0 4 20h16a1 1 0 0 0 .7-1.7Z"
      />
    </svg>
    {#if unread > 0}
      <span class="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
    {/if}
    <span class={`glow ${unread > 0 ? 'active' : ''}`} aria-hidden="true"></span>
  </button>

  {#if open}
    <div
      bind:this={listEl}
      class="dropdown"
      role="menu"
      aria-label="Notifications"
      data-testid="notification-dropdown"
    >
      <header>
        <div>
          <p class="title">Notifications</p>
          <p class="subtitle">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        <button
          type="button"
          class="mark-read"
          on:click={markAllRead}
          disabled={unread === 0}
        >
          Mark all as read
        </button>
      </header>

      <ul>
        {#if items.length === 0}
          <li class="empty" aria-live="polite">Nothing to show yet.</li>
        {:else}
          {#each items as item (item.id)}
            <li class={`item ${item.read ? '' : 'unread'}`} role="menuitem">
              <div class="indicator" aria-hidden="true"></div>
              <div class="copy">
                <p class="message">{describe(item)}</p>
                <time datetime={item.created_at}>{relativeTime(item.created_at)}</time>
              </div>
            </li>
          {/each}
        {/if}
      </ul>
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
  }

  .bell {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.6);
    color: rgba(226, 232, 240, 0.92);
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
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
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 18px;
    box-shadow: 0 22px 45px rgba(15, 23, 42, 0.45);
    padding: 16px;
    display: grid;
    gap: 10px;
    z-index: 40;
    backdrop-filter: blur(12px);
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
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(30, 41, 59, 0.55);
  }

  .item.unread {
    border: 1px solid rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.08);
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

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.8;
    }
  }
</style>
