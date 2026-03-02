<script lang="ts">
  import { onMount } from 'svelte';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  type NotificationRow = {
    id: string;
    kind: string;
    target_kind: string;
    target_id: string;
    created_at: string;
    read: boolean;
    metadata: Record<string, unknown> | null;
  };

  type PremiumNotificationStyle = 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null;

  let items: NotificationRow[] = [];
  let loading = false;
  let errorMessage: string | null = null;
  $: premiumStyle = (data.premiumNotificationStyle ?? null) as PremiumNotificationStyle;
  $: unreadCount = items.filter((item) => !item.read).length;

  const load = async () => {
    loading = true;
    errorMessage = null;
    try {
      const res = await fetch('/api/notifications?limit=50', { headers: { 'cache-control': 'no-store' } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load notifications.');
      }
      items = Array.isArray(payload?.items) ? (payload.items as NotificationRow[]) : [];
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load notifications.';
    } finally {
      loading = false;
    }
  };

  const markRead = async (notificationId: string) => {
    const previous = items;
    items = items.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notificationId })
    });
    if (!res.ok) {
      items = previous;
    }
  };

  const markAll = async () => {
    const previous = items;
    items = items.map((item) => ({ ...item, read: true }));
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    if (!res.ok) {
      items = previous;
    }
  };

  const describe = (item: NotificationRow) => {
    const meta = item.metadata ?? {};
    if (item.kind === 'event_reminder') {
      const eventTitle = typeof meta.eventTitle === 'string' ? meta.eventTitle : null;
      return eventTitle ? `${eventTitle} starts soon.` : 'You have an event reminder.';
    }

    if (item.kind === 'companion_nudge') {
      const title = typeof meta.title === 'string' ? meta.title : null;
      const body = typeof meta.body === 'string' ? meta.body : null;
      if (title && body) return `${title} ${body}`;
      if (title) return title;
      return 'Your companion has an update.';
    }

    if (item.kind === 'achievement_unlocked') {
      return 'Achievement unlocked.';
    }

    return 'You have a new notification.';
  };

  const styleLabel = (style: PremiumNotificationStyle) => {
    switch (style) {
      case 'gilded_dawn':
        return 'Gilded Dawn';
      case 'moon_glass':
        return 'Moon Glass';
      case 'ember_bloom':
        return 'Ember Bloom';
      case 'tide_silk':
        return 'Tide Silk';
      default:
        return null;
    }
  };

  const notificationStyle = (item: NotificationRow) => {
    const style = item.metadata?.premiumStyle;
    return style === 'gilded_dawn' || style === 'moon_glass' || style === 'ember_bloom' || style === 'tide_silk'
      ? style
      : null;
  };

  const isDigest = (item: NotificationRow) => item.metadata?.digest === true;

  const formatTime = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Unknown time';
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  onMount(async () => {
    await load();
  });
</script>

<SanctuaryPageFrame
  eyebrow="Signals"
  title="Notifications"
  subtitle="Keep reminders, nudges, and activity readable without turning the app into a noisy inbox."
>
  <svelte:fragment slot="actions">
    <EmotionalChip tone={unreadCount > 0 ? 'warm' : 'muted'}>{unreadCount} unread</EmotionalChip>
    <EmotionalChip tone="cool">{items.length} total</EmotionalChip>
  </svelte:fragment>

  <section class="notifications-page" aria-label="Notifications inbox" data-premium-style={premiumStyle ?? 'default'}>
    <header class={`notifications-chapter panel notifications-chapter--${data.notificationChapterFrame?.tone ?? 'quiet'}`}>
      <div>
        <p class="eyebrow">Current chapter</p>
        <h2>{data.notificationChapterFrame?.title ?? 'Only worth-keeping signals should surface'}</h2>
        <p class="lede">
          {data.notificationChapterFrame?.body ??
            'Let this inbox stay quiet until something truly deserves your attention.'}
        </p>
      </div>
      {#if premiumStyle}
        <div class="premium-style-badge">
          <span>Sanctuary+</span>
          <strong>{styleLabel(premiumStyle)}</strong>
        </div>
      {/if}
    </header>

    <header class="notifications-hero panel">
      <div>
        <p class="eyebrow">Inbox pulse</p>
        <h1>Your Looma signals</h1>
        <p class="lede">Important nudges should feel gentle and readable, especially on your phone.</p>
      </div>
      <div class="hero-actions">
        <button type="button" on:click={markAll} disabled={unreadCount === 0}>Mark all read</button>
      </div>
    </header>

    {#if loading}
      <p class="state">Loading notifications…</p>
    {:else if errorMessage}
      <p class="error" role="status">{errorMessage}</p>
    {:else if items.length === 0}
      <div class="empty-panel panel">
        <p class="state">No notifications yet.</p>
        <p class="empty-copy">When Looma has something worth surfacing, it will appear here.</p>
      </div>
    {:else}
      <ul>
        {#each items as item}
          <li class:unread={!item.read} data-premium-style={notificationStyle(item) ?? 'default'}>
            <div>
              <div class="notification-row-head">
                {#if isDigest(item)}
                  <span class="notification-kind-badge">Chapter digest</span>
                {/if}
                {#if notificationStyle(item)}
                  <span class="notification-kind-badge notification-kind-badge--premium">{styleLabel(notificationStyle(item))}</span>
                {/if}
              </div>
              <p class="desc">{describe(item)}</p>
              <small>{formatTime(item.created_at)}</small>
            </div>
            {#if !item.read}
              <button type="button" class="ghost" on:click={() => markRead(item.id)}>Mark read</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</SanctuaryPageFrame>

<style>
  .notifications-page {
    width: min(100%, 56rem);
    margin: 0 auto;
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1rem;
  }

  .notifications-page[data-premium-style='gilded_dawn'] .notifications-hero,
  .notifications-page[data-premium-style='gilded_dawn'] .notifications-chapter {
    box-shadow: inset 0 0 0 1px rgba(255, 228, 170, 0.06), 0 0 42px rgba(255, 223, 161, 0.05);
  }

  .notifications-page[data-premium-style='moon_glass'] .notifications-hero,
  .notifications-page[data-premium-style='moon_glass'] .notifications-chapter {
    box-shadow: inset 0 0 0 1px rgba(212, 228, 255, 0.06), 0 0 42px rgba(210, 226, 255, 0.05);
  }

  .notifications-page[data-premium-style='ember_bloom'] .notifications-hero,
  .notifications-page[data-premium-style='ember_bloom'] .notifications-chapter {
    box-shadow: inset 0 0 0 1px rgba(255, 196, 164, 0.06), 0 0 42px rgba(255, 192, 152, 0.05);
  }

  .notifications-page[data-premium-style='tide_silk'] .notifications-hero,
  .notifications-page[data-premium-style='tide_silk'] .notifications-chapter {
    box-shadow: inset 0 0 0 1px rgba(190, 236, 232, 0.06), 0 0 42px rgba(176, 228, 224, 0.05);
  }

  .notifications-hero {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }

  .notifications-chapter {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
    padding: 1rem;
    display: grid;
    gap: 0.85rem;
  }

  .premium-style-badge {
    display: inline-grid;
    justify-self: start;
    gap: 0.08rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 229, 174, 0.26);
    padding: 0.48rem 0.8rem;
    background: rgba(255, 241, 210, 0.08);
  }

  .premium-style-badge span {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(248, 226, 186, 0.72);
  }

  .premium-style-badge strong {
    color: rgba(255, 246, 228, 0.96);
    font-size: 0.82rem;
  }

  .notifications-chapter--care {
    background:
      linear-gradient(160deg, rgba(18, 35, 31, 0.82), rgba(11, 18, 20, 0.9)),
      radial-gradient(circle at top left, rgba(132, 214, 179, 0.12), transparent 42%);
  }

  .notifications-chapter--social {
    background:
      linear-gradient(160deg, rgba(42, 26, 25, 0.82), rgba(16, 17, 21, 0.9)),
      radial-gradient(circle at top left, rgba(233, 162, 122, 0.12), transparent 42%);
  }

  .notifications-chapter--mission {
    background:
      linear-gradient(160deg, rgba(38, 30, 19, 0.82), rgba(14, 18, 21, 0.9)),
      radial-gradient(circle at top left, rgba(222, 186, 103, 0.12), transparent 42%);
  }

  .notifications-chapter--play {
    background:
      linear-gradient(160deg, rgba(18, 30, 37, 0.82), rgba(11, 17, 21, 0.9)),
      radial-gradient(circle at top left, rgba(124, 220, 224, 0.12), transparent 42%);
  }

  .notifications-chapter--bond {
    background:
      linear-gradient(160deg, rgba(34, 28, 24, 0.82), rgba(14, 18, 21, 0.9)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 42%);
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  h1 {
    margin: 0.15rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.5rem, 4vw, 2.2rem);
    color: rgba(249, 243, 230, 0.98);
  }

  .lede,
  .empty-copy {
    margin: 0.35rem 0 0;
    color: rgba(223, 211, 188, 0.78);
    line-height: 1.5;
  }

  .hero-actions {
    display: flex;
    justify-content: flex-start;
  }

  button {
    border: 1px solid rgba(214, 190, 141, 0.16);
    border-radius: 999px;
    background: rgba(43, 33, 20, 0.24);
    color: rgba(245, 238, 225, 0.95);
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  button.ghost {
    background: rgba(214, 190, 141, 0.1);
  }

  .state { margin:0; color: rgba(220, 209, 184, 0.8); }
  .error { margin:0; color: #fda4af; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.7rem; }
  li {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:.8rem;
    border:1px solid rgba(214, 190, 141, 0.14);
    border-radius:1rem;
    padding:.85rem;
    background: rgba(21, 18, 15, 0.72);
  }
  li.unread { border-color: rgba(214, 190, 141, 0.32); background: rgba(43, 33, 20, 0.28); }
  li[data-premium-style='gilded_dawn'] {
    box-shadow: inset 0 0 0 1px rgba(255, 228, 170, 0.06);
  }
  li[data-premium-style='moon_glass'] {
    box-shadow: inset 0 0 0 1px rgba(212, 228, 255, 0.06);
  }
  li[data-premium-style='ember_bloom'] {
    box-shadow: inset 0 0 0 1px rgba(255, 196, 164, 0.06);
  }
  li[data-premium-style='tide_silk'] {
    box-shadow: inset 0 0 0 1px rgba(190, 236, 232, 0.06);
  }
  .notification-row-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 0.35rem;
  }
  .notification-kind-badge {
    border-radius: 999px;
    padding: 0.18rem 0.55rem;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(244, 232, 209, 0.78);
    background: rgba(214, 190, 141, 0.12);
    border: 1px solid rgba(214, 190, 141, 0.18);
  }
  .notification-kind-badge--premium {
    border-color: rgba(255, 229, 174, 0.24);
    background: rgba(255, 241, 210, 0.08);
  }
  .desc { margin:0; color: rgba(245, 238, 225, 0.94); line-height: 1.45; }
  small { color: rgba(198, 184, 154, 0.88); }
  .empty-panel {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(21, 18, 15, 0.72);
    padding: 1rem;
  }

  @media (max-width: 640px) {
    li {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
