<script lang="ts">
  export let seconds = 0;
  export let busy = false;

  const format = (value: number) => {
    if (value <= 0) return 'Ready';
    if (value < 60) return `${Math.max(1, Math.ceil(value))}s`;
    const minutes = Math.ceil(value / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
  };

  $: label = busy ? 'Working…' : format(seconds);
</script>

<span class={`cooldown-badge ${busy ? 'busy' : seconds > 0 ? 'waiting' : 'ready'}`} aria-live="polite">
  {label}
</span>

<style>
  .cooldown-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    min-width: 4.5rem;
  }

  .cooldown-badge.ready {
    border-color: rgba(90, 246, 192, 0.7);
    background: rgba(90, 246, 192, 0.2);
    color: rgba(13, 183, 120, 0.95);
  }

  .cooldown-badge.waiting {
    border-color: rgba(255, 188, 84, 0.65);
    background: rgba(255, 188, 84, 0.15);
    color: rgba(255, 213, 164, 0.95);
  }

  .cooldown-badge.busy {
    border-color: rgba(58, 215, 255, 0.6);
    background: rgba(58, 215, 255, 0.2);
    color: rgba(15, 68, 109, 0.95);
  }
</style>
