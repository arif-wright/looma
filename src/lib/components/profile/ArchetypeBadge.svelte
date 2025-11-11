<script lang="ts">
  const COLOR_MAP: Record<string, string> = {
    lumina: '#f5a7b8',
    vexel: '#3ad7ff',
    aurex: '#ffba3a',
    mirae: '#b38bff',
    tova: '#9ab27c',
    kynth: '#ff4fb8',
    elar: '#2ad1c9',
    nira: '#ff5a5f'
  };

  export let archetype: string | null = null;
  export let color: string | null = null;

  $: lower = archetype?.toLowerCase() ?? null;
  $: resolvedColor = color ?? (lower ? COLOR_MAP[lower] : null) ?? '#ffffff66';
  $: label = archetype ? `Player archetype: ${archetype}` : '';
</script>

{#if archetype}
  <span
    class="archetype-badge"
    style={`--badge-color:${resolvedColor}`}
    data-testid="archetype-badge"
    aria-label={label}
  >
    <span class="badge-dot" aria-hidden="true"></span>
    <span class="badge-label capitalize">{archetype}</span>
  </span>
{/if}

<style>
  .archetype-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    font-size: 0.76rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.88);
    background: color-mix(in srgb, var(--badge-color, rgba(255, 255, 255, 0.08)) 25%, rgba(255, 255, 255, 0.08));
    border: 1px solid color-mix(in srgb, var(--badge-color, rgba(255, 255, 255, 0.2)) 60%, rgba(255, 255, 255, 0.14));
  }

  .badge-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--badge-color, rgba(255, 255, 255, 0.8));
    box-shadow: 0 0 6px var(--badge-color, rgba(255, 255, 255, 0.5));
  }

  .badge-label {
    line-height: 1;
  }
</style>
