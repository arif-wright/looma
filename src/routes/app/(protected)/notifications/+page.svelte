<script lang="ts">
  import { onMount } from 'svelte';

  type NotificationRow = {
    id: string;
    kind: string;
    target_kind: string;
    target_id: string;
    created_at: string;
    read: boolean;
    metadata: Record<string, unknown> | null;
  };

  let items: NotificationRow[] = [];
  let loading = false;
  let errorMessage: string | null = null;

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
      return 'Your companion has an update.';
    }

    if (item.kind === 'achievement_unlocked') {
      return 'Achievement unlocked.';
    }

    return 'You have a new notification.';
  };

  const formatTime = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Unknown time';
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  onMount(async () => {
    await load();
  });
</script>

<section class="notifications-page" aria-label="Notifications inbox">
  <header>
    <h1>Notifications</h1>
    <button type="button" on:click={markAll}>Mark all read</button>
  </header>

  {#if loading}
    <p class="state">Loading notifications…</p>
  {:else if errorMessage}
    <p class="error" role="status">{errorMessage}</p>
  {:else if items.length === 0}
    <p class="state">No notifications yet.</p>
  {:else}
    <ul>
      {#each items as item}
        <li class:unread={!item.read}>
          <div>
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

<style>
  .notifications-page { margin: 1rem; padding: 1rem; border: 1px solid rgba(148,163,184,.22); border-radius: 1rem; background: rgba(15,23,42,.35); display:grid; gap:.85rem; }
  header { display:flex; justify-content:space-between; align-items:center; gap:.7rem; }
  h1 { margin:0; font-size:1.2rem; }
  button { border:1px solid rgba(148,163,184,.25); border-radius:.6rem; background: rgba(15,23,42,.5); color:#e2e8f0; padding:.42rem .65rem; cursor:pointer; }
  button.ghost { background: rgba(148,163,184,.18); }
  .state { margin:0; color: rgba(148,163,184,.94); }
  .error { margin:0; color: #fda4af; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.55rem; }
  li { display:flex; justify-content:space-between; align-items:flex-start; gap:.8rem; border:1px solid rgba(148,163,184,.18); border-radius:.8rem; padding:.75rem; }
  li.unread { border-color: rgba(34,211,238,.45); background: rgba(34,211,238,.08); }
  .desc { margin:0; color: rgba(226,232,240,.94); }
  small { color: rgba(148,163,184,.92); }
</style>
