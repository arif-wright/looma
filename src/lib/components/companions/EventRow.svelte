<script lang="ts">
  export let event: {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
  };

  const actionMeta: Record<string, { emoji: string; label: string }> = {
    feed: { emoji: '🍓', label: 'Feed' },
    play: { emoji: '🪁', label: 'Play' },
    groom: { emoji: '✨', label: 'Groom' },
    system: { emoji: '🌀', label: 'System' }
  };

  const formatDelta = (value: number, label: string) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value} ${label}`;
  };

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const formatRelative = (iso: string) => {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'just now';
    const diffMs = ts - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    if (Math.abs(diffMinutes) < 1) {
      const diffSeconds = Math.round(diffMs / 1000);
      return formatter.format(diffSeconds, 'second');
    }
    if (Math.abs(diffMinutes) < 60) {
      return formatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return formatter.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, 'day');
  };

  $: actionKey = (event.action ?? 'system').toLowerCase();
  $: meta = actionMeta[actionKey] ?? actionMeta.system;
</script>

<li class="event-row">
  <div class="event-row__icon" aria-hidden="true">{meta.emoji}</div>
  <div class="event-row__body">
    <div class="event-row__meta">
      <strong class="event-row__action">{meta.label}</strong>
      <time datetime={event.created_at}>{formatRelative(event.created_at)}</time>
    </div>
    <p>
      {formatDelta(event.affection_delta, 'affection')} ·
      {formatDelta(event.trust_delta, 'trust')} ·
      {formatDelta(event.energy_delta, 'energy')}
    </p>
  </div>
</li>

<style>
  .event-row {
    list-style: none;
    padding: 0.85rem 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .event-row:last-child {
    border-bottom: none;
  }

  .event-row__icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    font-size: 1.2rem;
  }

  .event-row__body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .event-row__meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .event-row__action {
    letter-spacing: 0.05em;
  }

  .event-row time {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.8);
  }
</style>
