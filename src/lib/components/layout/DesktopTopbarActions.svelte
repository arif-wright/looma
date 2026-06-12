<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Bell, ChevronDown, MessageCircle, Settings, UserRound } from 'lucide-svelte';
  import ShardIcon from '$lib/components/ui/ShardIcon.svelte';
  import type { MessengerConversation } from '$lib/components/messenger/types';
  import type { NotificationItem } from '$lib/components/ui/types';
  import { relativeTime } from '$lib/social/commentHelpers';

  export let shardBalance = 0;
  export let notifications: NotificationItem[] = [];
  export let profileAvatarUrl: string | null = null;
  export let profileDisplayName = 'Traveler';
  export let className = '';
  export { className as class };

  const tones = ['#a75cff', '#ddaa5c', '#62e8ff', '#ff6fb8', '#8d5cff'];

  let rootRef: HTMLDivElement | null = null;
  let notificationsOpen = false;
  let messagesOpen = false;
  let profileMenuOpen = false;
  let markingNotifications = false;
  let notificationItems: NotificationItem[] = normalizeNotifications(notifications);
  let lastNotifications = notifications;
  let conversations: MessengerConversation[] = [];
  let conversationsLoading = false;
  let conversationsLoaded = false;
  let conversationsError: string | null = null;

  $: if (notifications !== lastNotifications) {
    lastNotifications = notifications;
    notificationItems = normalizeNotifications(notifications);
  }
  $: unreadNotifications = notificationItems.filter((item) => !item.read).length;
  $: notificationPreview = notificationItems.slice(0, 5);
  $: unreadMessages = conversations.reduce((total, conversation) => total + Math.max(0, conversation.unreadCount ?? 0), 0);

  function normalizeNotifications(items: NotificationItem[]) {
    return (items ?? []).map((item) => ({
      ...item,
      metadata: (item.metadata ?? {}) as Record<string, unknown>
    }));
  }

  function getMetaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]) {
    if (!meta) return null;
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  function notificationTitle(item: NotificationItem) {
    const meta = (item.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.title === 'string' && meta.title.trim()) return meta.title;
    if (typeof meta.rewardTitle === 'string' && meta.rewardTitle.trim()) return meta.rewardTitle;
    if (typeof (item as any).title === 'string' && (item as any).title.trim()) return (item as any).title;
    if (item.kind === 'achievement_unlocked') return 'Achievement Unlocked';
    if (item.kind === 'companion_nudge') return 'Companion Nudge';
    if (item.kind === 'event_reminder') return 'Event Reminder';
    if (item.kind === 'comment') return 'New Comment';
    if (item.kind === 'reaction') return 'New Reaction';
    if (item.kind === 'share') return 'Shared Moment';
    return 'New Notification';
  }

  function notificationBody(item: NotificationItem) {
    const meta = (item.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.body === 'string' && meta.body.trim()) return meta.body;
    if (typeof meta.description === 'string' && meta.description.trim()) return meta.description;
    if (typeof (item as any).body === 'string' && (item as any).body.trim()) return (item as any).body;
    if (item.kind === 'achievement_unlocked') return 'A new reward is ready for you.';
    if (item.kind === 'companion_nudge') return 'Your companion has something for you.';
    if (item.kind === 'event_reminder') return 'Something is starting soon.';
    if (item.kind === 'comment') return 'Someone replied to your thread.';
    if (item.kind === 'reaction') return 'Someone reacted to your moment.';
    if (item.kind === 'share') return 'Someone shared one of your moments.';
    return getMetaString(meta, 'message') ?? 'Memvoya has an update for you.';
  }

  function notificationHref(item: NotificationItem) {
    if (item.target_kind === 'companion') return '/app/companions';
    if (item.target_kind === 'event') return '/app/events';
    if (item.target_kind === 'achievement') return '/app/profile';
    return '/app/notifications';
  }

  function closeMenus() {
    notificationsOpen = false;
    messagesOpen = false;
    profileMenuOpen = false;
  }

  function toggleNotifications() {
    notificationsOpen = !notificationsOpen;
    messagesOpen = false;
    profileMenuOpen = false;
  }

  function toggleMessages() {
    messagesOpen = !messagesOpen;
    notificationsOpen = false;
    profileMenuOpen = false;
    if (messagesOpen) void fetchConversations();
  }

  function toggleProfileMenu() {
    profileMenuOpen = !profileMenuOpen;
    notificationsOpen = false;
    messagesOpen = false;
  }

  function handleDocumentClick(event: MouseEvent) {
    if (!rootRef || !(event.target instanceof Node)) return;
    if (!rootRef.contains(event.target)) closeMenus();
  }

  async function markNotificationsRead() {
    if (markingNotifications || unreadNotifications === 0) return;
    markingNotifications = true;
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all' })
      });
      if (!response.ok) return;
      notificationItems = notificationItems.map((item) => ({ ...item, read: true }));
    } finally {
      markingNotifications = false;
    }
  }

  const conversationName = (conversation: MessengerConversation) =>
    conversation.type === 'group'
      ? conversation.group_name ?? 'Group conversation'
      : conversation.peer?.display_name ?? conversation.peer?.handle ?? 'Someone';

  const conversationPreview = (conversation: MessengerConversation) =>
    conversation.blocked ? 'This conversation is blocked.' : conversation.preview?.trim() || 'No messages yet.';

  const conversationInitial = (conversation: MessengerConversation) =>
    conversationName(conversation).trim().slice(0, 1).toUpperCase() || 'M';

  async function fetchConversations() {
    if (conversationsLoading || conversationsLoaded) return;
    conversationsLoading = true;
    conversationsError = null;
    try {
      const response = await fetch('/api/messenger/conversations', { headers: { 'cache-control': 'no-store' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        conversationsError = typeof payload?.message === 'string' ? payload.message : 'Could not load messages.';
        return;
      }
      conversations = Array.isArray(payload?.items) ? payload.items.slice(0, 5) : [];
      conversationsLoaded = true;
    } catch {
      conversationsError = 'Could not load messages.';
    } finally {
      conversationsLoading = false;
    }
  }

  onMount(() => {
    if (!browser) return;
    document.addEventListener('click', handleDocumentClick, true);
  });

  onDestroy(() => {
    if (!browser) return;
    document.removeEventListener('click', handleDocumentClick, true);
  });
</script>

<div class={`desktop-topbar-actions ${className}`.trim()} bind:this={rootRef}>
  <a class="currency action-control" href="/app/wallet" aria-label={`Open wallet, ${shardBalance.toLocaleString()} shards`}>
    <ShardIcon size={20} />
    <span>{shardBalance.toLocaleString()}</span>
  </a>

  <div class="action-menu" class:open={notificationsOpen}>
    <button
      class="icon-action action-control"
      type="button"
      aria-label={unreadNotifications > 0 ? `Notifications (${unreadNotifications} unread)` : 'Notifications'}
      aria-expanded={notificationsOpen}
      aria-haspopup="dialog"
      on:click={toggleNotifications}
    >
      <Bell size={19} />
      {#if unreadNotifications > 0}
        <span class="badge" class:wide={unreadNotifications > 9}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
      {/if}
    </button>
    {#if notificationsOpen}
      <div class="dropdown" role="dialog" aria-label="Notifications">
        <header>
          <h2>Notifications</h2>
          <button type="button" on:click={markNotificationsRead} disabled={markingNotifications || unreadNotifications === 0}>
            Mark all as read
          </button>
        </header>

        <div class="dropdown-list">
          {#if notificationPreview.length > 0}
            {#each notificationPreview as item, index (item.id)}
              <a class="dropdown-item" class:unread={!item.read} href={notificationHref(item)}>
                <span class="dropdown-icon" style={`--tone: ${tones[index % tones.length]}`}>
                  <ShardIcon size={21} />
                </span>
                <span class="dropdown-copy">
                  <strong>{notificationTitle(item)}</strong>
                  <small>{notificationBody(item)}</small>
                  <time datetime={item.created_at}>{relativeTime(item.created_at)}</time>
                </span>
                {#if !item.read}
                  <i aria-hidden="true"></i>
                {/if}
              </a>
            {/each}
          {:else}
            <p class="dropdown-empty">No notifications yet.</p>
          {/if}
        </div>

        <a class="dropdown-footer" href="/app/notifications">
          <span>View All Notifications</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    {/if}
  </div>

  <div class="action-menu" class:open={messagesOpen}>
    <button
      class="icon-action action-control"
      type="button"
      aria-label={unreadMessages > 0 ? `Messages (${unreadMessages} unread)` : 'Messages'}
      aria-expanded={messagesOpen}
      aria-haspopup="dialog"
      on:click={toggleMessages}
    >
      <MessageCircle size={19} />
      {#if unreadMessages > 0}
        <span class="badge" class:wide={unreadMessages > 9}>{unreadMessages > 9 ? '9+' : unreadMessages}</span>
      {/if}
    </button>
    {#if messagesOpen}
      <div class="dropdown message-dropdown" role="dialog" aria-label="Messages">
        <header>
          <h2>Messages</h2>
          <a href="/app/messages">Open inbox</a>
        </header>

        <div class="dropdown-list">
          {#if conversationsLoading}
            <p class="dropdown-empty">Loading messages...</p>
          {:else if conversationsError}
            <p class="dropdown-empty">{conversationsError}</p>
          {:else if conversations.length > 0}
            {#each conversations as conversation, index (conversation.conversationId)}
              <a
                class="dropdown-item message-item"
                class:unread={conversation.unreadCount > 0}
                href={`/app/messages?conversation=${conversation.conversationId}`}
              >
                <span class="message-avatar" style={`--tone: ${tones[index % tones.length]}`}>
                  {#if conversation.peer?.avatar_url}
                    <img src={conversation.peer.avatar_url} alt="" loading="lazy" />
                  {:else}
                    <span>{conversationInitial(conversation)}</span>
                  {/if}
                </span>
                <span class="dropdown-copy">
                  <strong>{conversationName(conversation)}</strong>
                  <small>{conversationPreview(conversation)}</small>
                  {#if conversation.last_message_at}
                    <time datetime={conversation.last_message_at}>{relativeTime(conversation.last_message_at)}</time>
                  {/if}
                </span>
                {#if conversation.unreadCount > 0}
                  <i aria-label={`${conversation.unreadCount} unread`}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</i>
                {/if}
              </a>
            {/each}
          {:else}
            <p class="dropdown-empty">No conversations yet.</p>
          {/if}
        </div>

        <a class="dropdown-footer" href="/app/messages">
          <span>View All Messages</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    {/if}
  </div>

  <div class="action-menu profile-menu" class:open={profileMenuOpen}>
    <button
      type="button"
      class="avatar-action action-control"
      aria-label="Open profile menu"
      aria-expanded={profileMenuOpen}
      aria-haspopup="menu"
      on:click={toggleProfileMenu}
    >
      {#if profileAvatarUrl}
        <img src={profileAvatarUrl} alt="" />
      {:else}
        <span>{profileDisplayName.slice(0, 1).toUpperCase()}</span>
      {/if}
      <ChevronDown size={14} />
    </button>
    {#if profileMenuOpen}
      <div class="dropdown profile-dropdown" role="menu" aria-label="Profile menu">
        <header>
          <h2>{profileDisplayName}</h2>
        </header>
        <div class="dropdown-list">
          <a class="dropdown-item profile-link" href="/app/profile" role="menuitem">
            <span class="dropdown-icon" style="--tone: #a75cff"><UserRound size={18} /></span>
            <span class="dropdown-copy">
              <strong>View Profile</strong>
              <small>Open your public profile page.</small>
            </span>
          </a>
          <a class="dropdown-item profile-link" href="/app/preferences" role="menuitem">
            <span class="dropdown-icon" style="--tone: #ddaa5c"><Settings size={18} /></span>
            <span class="dropdown-copy">
              <strong>User Settings</strong>
              <small>Manage account and experience settings.</small>
            </span>
          </a>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .desktop-topbar-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.7rem;
    position: relative;
    z-index: 5000;
  }

  .action-menu {
    position: relative;
    display: inline-flex;
    z-index: 5001;
  }

  .action-menu.open {
    z-index: 5002;
  }

  .action-control {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(170, 151, 255, 0.18);
    background: rgba(13, 14, 34, 0.62);
    color: white;
    text-decoration: none;
    backdrop-filter: blur(18px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .currency {
    gap: 0.5rem;
    min-width: 6.2rem;
    border-radius: 0.95rem;
    padding: 0 1rem;
    font-weight: 800;
  }

  .currency :global(svg) {
    filter: drop-shadow(0 0 0.45rem rgba(178, 83, 255, 0.75));
  }

  .icon-action,
  .avatar-action {
    width: 2.75rem;
    border-radius: 999px;
  }

  .icon-action {
    position: relative;
    cursor: pointer;
  }

  .avatar-action {
    gap: 0.45rem;
    width: auto;
    padding: 0 0.42rem;
    cursor: pointer;
  }

  .action-menu.open .icon-action,
  .action-menu.open .avatar-action,
  .icon-action:hover,
  .icon-action:focus-visible,
  .avatar-action:hover,
  .avatar-action:focus-visible {
    border-color: rgba(169, 123, 225, 0.52);
    background: rgba(26, 20, 55, 0.78);
    box-shadow: 0 0 24px rgba(169, 123, 225, 0.2);
    transform: translateY(-1px);
  }

  .avatar-action img,
  .avatar-action > span {
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 999px;
  }

  .avatar-action img {
    display: block;
    object-fit: cover;
  }

  .avatar-action > span {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #ddaa5c, #a75cff);
    font-weight: 900;
  }

  .badge {
    position: absolute;
    top: -0.2rem;
    right: -0.1rem;
    width: 1.08rem;
    height: 1.08rem;
    padding: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #a75cff;
    color: white;
    font-size: 0.63rem;
    font-weight: 900;
    line-height: 1;
    box-shadow: 0 0 16px rgba(167, 92, 255, 0.72);
  }

  .badge.wide {
    width: auto;
    min-width: 1.08rem;
    padding-inline: 0.24rem;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 0.72rem);
    right: -0.4rem;
    z-index: 5003;
    width: min(21.5rem, calc(100vw - 2rem));
    border: 1px solid rgba(169, 123, 225, 0.24);
    border-radius: 0.95rem;
    background:
      radial-gradient(circle at 12% 8%, rgba(126, 92, 255, 0.24), transparent 14rem),
      linear-gradient(180deg, rgba(15, 16, 40, 0.98), rgba(8, 10, 27, 0.98));
    box-shadow:
      0 24px 70px rgba(2, 3, 14, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: rgba(249, 247, 255, 0.95);
    overflow: hidden;
    backdrop-filter: blur(24px);
  }

  .message-dropdown {
    right: -3.85rem;
  }

  .profile-dropdown {
    right: 0;
    width: min(19rem, calc(100vw - 2rem));
  }

  .dropdown header {
    min-height: 2.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(169, 123, 225, 0.14);
    padding: 0 0.85rem;
  }

  .dropdown h2 {
    margin: 0;
    font-size: 0.88rem;
  }

  .dropdown header button,
  .dropdown header a {
    border: 0;
    background: transparent;
    color: rgba(221, 211, 246, 0.74);
    font: inherit;
    font-size: 0.68rem;
    text-decoration: none;
    cursor: pointer;
  }

  .dropdown header button:hover:not(:disabled),
  .dropdown header button:focus-visible:not(:disabled),
  .dropdown header a:hover,
  .dropdown header a:focus-visible {
    color: #ddaa5c;
  }

  .dropdown header button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .dropdown-list {
    display: grid;
    gap: 0.12rem;
    padding: 0.52rem;
  }

  .dropdown-item {
    min-height: 4.05rem;
    border-radius: 0.6rem;
    display: grid;
    grid-template-columns: 2.35rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.72rem;
    padding: 0.52rem 0.5rem;
    color: inherit;
    text-decoration: none;
  }

  .dropdown-item:hover,
  .dropdown-item:focus-visible {
    background: rgba(169, 123, 225, 0.09);
    outline: none;
  }

  .dropdown-item.unread {
    background: rgba(169, 123, 225, 0.08);
  }

  .dropdown-icon,
  .message-avatar {
    display: grid;
    width: 2.15rem;
    height: 2.15rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tone), transparent 36%);
    border-radius: 0.72rem;
    background:
      radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--tone), white 8%), transparent 46%),
      rgba(10, 10, 29, 0.82);
    color: white;
    box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 52%);
  }

  .message-avatar {
    border-radius: 999px;
    overflow: hidden;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .message-avatar img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .dropdown-copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  .dropdown-copy strong,
  .dropdown-copy small,
  .dropdown-copy time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-copy strong {
    font-size: 0.78rem;
  }

  .dropdown-copy small,
  .dropdown-copy time,
  .dropdown-empty {
    color: rgba(225, 222, 245, 0.7);
    font-size: 0.7rem;
  }

  .dropdown-copy time {
    color: rgba(225, 222, 245, 0.48);
  }

  .dropdown-item i {
    min-width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #a75cff;
    color: white;
    font-size: 0.64rem;
    font-style: normal;
    font-weight: 900;
    box-shadow: 0 0 14px rgba(167, 92, 255, 0.7);
  }

  .dropdown-empty {
    margin: 0;
    padding: 1.6rem 0.75rem;
    text-align: center;
  }

  .dropdown-footer {
    min-height: 3.1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid rgba(169, 123, 225, 0.14);
    padding: 0 1.1rem;
    color: #c99cff;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
  }

  .dropdown-footer:hover,
  .dropdown-footer:focus-visible {
    color: #ddaa5c;
  }

  .profile-link {
    grid-template-columns: 2.35rem minmax(0, 1fr);
  }

  @media (max-width: 720px) {
    .desktop-topbar-actions {
      gap: 0.55rem;
    }

    .currency {
      min-width: auto;
      min-height: 2.45rem;
      border-radius: 999px;
      padding: 0 0.8rem;
      font-size: 0.82rem;
    }

    .icon-action {
      width: 2.55rem;
      min-height: 2.55rem;
    }

    .avatar-action {
      display: none;
    }
  }
</style>
