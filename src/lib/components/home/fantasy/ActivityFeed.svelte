<script lang="ts">
  import { Sparkles } from 'lucide-svelte';
  import ShardIcon from '$lib/components/ui/ShardIcon.svelte';
  import type { NotificationItem } from '$lib/components/ui/types';

  export let notifications: NotificationItem[] = [];

  const relativeTime = (iso: string) => {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return 'Now';
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return 'Now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const notificationLabel = (item: NotificationItem) => {
    const actor = typeof item.metadata?.actor_name === 'string' ? item.metadata.actor_name : 'Someone';
    switch (item.kind) {
      case 'reaction':
        return { name: `${actor} reacted`, detail: 'to your post', shard: false };
      case 'comment':
        return { name: `${actor} commented`, detail: 'on your thread', shard: false };
      case 'share':
        return { name: `${actor} shared`, detail: 'one of your moments', shard: false };
      case 'achievement_unlocked':
        return { name: 'Achievement unlocked', detail: String(item.metadata?.title ?? 'New reward'), shard: true };
      case 'companion_nudge':
        return { name: 'Companion nudge', detail: String(item.metadata?.title ?? 'A bond moment is ready'), shard: false };
      case 'event_reminder':
        return { name: 'Event reminder', detail: String(item.metadata?.title ?? 'Something is starting soon'), shard: false };
      default:
        return { name: 'New activity', detail: 'Memvoya has an update', shard: false };
    }
  };

  $: items = notifications.slice(0, 4).map((item, index) => ({
    ...notificationLabel(item),
    id: item.id,
    time: relativeTime(item.created_at),
    tone: ['#a75cff', '#ff6fb8', '#ffd36e', '#62e8ff'][index % 4],
    icon: Sparkles
  }));
</script>

<section class="side-panel" aria-labelledby="activity-title">
  <header>
    <h2 id="activity-title">Activity Feed</h2>
    <a href="/app/notifications">View All</a>
  </header>
  {#if items.length > 0}
    <div class="items">
      {#each items as item}
      <article>
        <span class="icon" style={`--tone: ${item.tone}`}>
          {#if item.shard}
            <ShardIcon size={22} />
          {:else}
            <svelte:component this={item.icon} size={17} />
          {/if}
        </span>
        <div>
          <p>{item.name}</p>
          <strong>{item.detail}</strong>
        </div>
        <time>{item.time}</time>
      </article>
      {/each}
    </div>
  {:else}
    <p class="empty">No new activity yet.</p>
  {/if}
</section>

<style>
  .side-panel {
    border: 1px solid rgba(166, 145, 255, 0.2);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 80% 0%, rgba(139, 92, 246, 0.12), transparent 38%),
      rgba(17, 16, 39, 0.66);
    padding: 1rem;
    color: white;
    backdrop-filter: blur(22px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  header,
  article {
    display: flex;
    align-items: center;
  }

  header {
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 0.96rem;
  }

  a,
  time,
  p {
    color: rgba(225, 222, 245, 0.66);
    font-size: 0.76rem;
    text-decoration: none;
  }

  .empty {
    padding: 0.3rem 0 0.1rem;
  }

  .items {
    display: grid;
  }

  article {
    gap: 0.68rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    padding: 0.68rem 0;
  }

  article:first-child {
    padding-top: 0;
  }

  article:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .icon {
    display: grid;
    width: 2.32rem;
    height: 2.32rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tone), transparent 45%);
    border-radius: 0.8rem;
    background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--tone), white 10%), color-mix(in srgb, var(--tone), transparent 45%));
    color: white;
    box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 55%);
  }

  article div {
    min-width: 0;
    flex: 1;
  }

  strong {
    display: block;
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.8rem;
    font-weight: 600;
  }
</style>
