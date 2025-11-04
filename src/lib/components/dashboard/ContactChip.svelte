<script lang="ts">
  export let name = 'Looma Companion';
  export let status: 'online' | 'idle' | 'away' | 'offline' = 'online';

  const statusLabel: Record<typeof status, string> = {
    online: 'Online',
    idle: 'Idle',
    away: 'Away',
    offline: 'Offline'
  } as const;
</script>

<div class="contact">
  <div class="contact__avatar" aria-hidden="true">{name.slice(0, 2)}</div>
  <div class="contact__meta">
    <span class="contact__name">{name}</span>
    <span class="contact__status" data-state={status}>
      <span class="dot" aria-hidden="true"></span>
      {statusLabel[status]}
    </span>
  </div>
</div>

<style>
  .contact {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 0.9rem;
    border-radius: 1.1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  .contact__avatar {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(147, 197, 253, 0.35), rgba(244, 114, 182, 0.35));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.85);
  }

  .contact__meta {
    display: grid;
    gap: 0.15rem;
  }

  .contact__name {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.92);
  }

  .contact__status {
    font-size: 0.78rem;
    color: rgba(226, 232, 240, 0.65);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .contact__status .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.6);
  }

  .contact__status[data-state='online'] .dot {
    background: rgba(74, 222, 128, 0.95);
  }

  .contact__status[data-state='idle'] .dot {
    background: rgba(250, 204, 21, 0.9);
  }

  .contact__status[data-state='away'] .dot {
    background: rgba(253, 186, 116, 0.9);
  }

  .contact__status[data-state='offline'] .dot {
    background: rgba(148, 163, 184, 0.45);
  }
</style>
