<script lang="ts">
  export let event: {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
    note?: string | null;
    kind?: string | null;
  };

  const actionMeta: Record<string, { emoji: string; label: string; note?: string }> = {
    feed: { emoji: '🍓', label: 'Feed' },
    play: { emoji: '🪁', label: 'Play' },
    groom: { emoji: '✨', label: 'Groom' },
    passive: { emoji: '🌙', label: 'Rest', note: 'Rested while you were away.' },
    daily_bonus: { emoji: '✨', label: 'Daily glow', note: 'Brightened when you checked in today.' },
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

  $: actionKey = (event.kind ?? event.action ?? 'system').toLowerCase();
  $: meta = actionMeta[actionKey] ?? actionMeta.system;
  $: hasDeltas = Boolean((event.affection_delta ?? 0) || (event.trust_delta ?? 0) || (event.energy_delta ?? 0));
  $: isSoftEvent = actionKey === 'passive' || actionKey === 'daily_bonus';
</script>

<li class="event-row">
  <div class="event-row__icon" aria-hidden="true">{meta.emoji}</div>
  <div class="event-row__body">
    <div class="event-row__meta">
      <strong class="event-row__action">{meta.label}</strong>
      <time datetime={event.created_at}>{formatRelative(event.created_at)}</time>
    </div>
    {#if isSoftEvent}
      <p class="event-row__message">{event.note ?? meta.note ?? meta.label}</p>
      {#if hasDeltas}
        <p class="event-row__delta event-row__delta--soft">
          {formatDelta(event.affection_delta, 'affection')} ·
          {formatDelta(event.trust_delta, 'trust')} ·
          {formatDelta(event.energy_delta, 'energy')}
        </p>
      {/if}
    {:else}
      <p class="event-row__delta">
        {formatDelta(event.affection_delta, 'affection')} ·
        {formatDelta(event.trust_delta, 'trust')} ·
        {formatDelta(event.energy_delta, 'energy')}
      </p>
    {/if}
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

  .event-row__message {
    margin: 0;
    font-size: 0.88rem;
    color: rgba(255, 255, 255, 0.82);
  }

  .event-row__delta {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .event-row__delta--soft {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
