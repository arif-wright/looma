<script lang="ts">
  export let event: {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
  };

  const formatDelta = (value: number, label: string) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value} ${label}`;
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '–';
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };
</script>

<li class="event-row">
  <div class="event-row__meta">
    <strong class="event-row__action">{event.action}</strong>
    <time datetime={event.created_at}>{formatTime(event.created_at)}</time>
  </div>
  <p>
    {formatDelta(event.affection_delta, 'affection')} ·
    {formatDelta(event.trust_delta, 'trust')} ·
    {formatDelta(event.energy_delta, 'energy')}
  </p>
</li>

<style>
  .event-row {
    list-style: none;
    padding: 0.85rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .event-row:last-child {
    border-bottom: none;
  }

  .event-row__meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
    margin-bottom: 0.25rem;
  }

  .event-row__action {
    text-transform: capitalize;
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
