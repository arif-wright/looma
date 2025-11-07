<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let shards: number | null = null;
  export let walletCurrency = 'SHARDS';

  const safeNumber = (value: number | null | undefined): number | null => {
    if (typeof value !== 'number') return null;
    return Number.isFinite(value) ? value : null;
  };

  const formatNumber = (value: number | null | undefined): string => {
    const numeric = safeNumber(value);
    if (numeric === null) return '—';
    return numeric.toLocaleString();
  };

  $: xpValue = safeNumber(xp) ?? 0;
  $: xpTarget = safeNumber(xpNext) ?? 0;
  $: xpPercent =
    xpTarget > 0 ? Math.min(100, Math.max(0, Math.round((xpValue / xpTarget) * 100))) : 0;
  $: xpLabel =
    xpTarget > 0
      ? `${formatNumber(xpValue)} / ${formatNumber(xpTarget)} XP`
      : `${formatNumber(xpValue)} XP`;

  $: energyLabel =
    safeNumber(energy) !== null && safeNumber(energyMax) !== null
      ? `${formatNumber(energy)} / ${formatNumber(energyMax)}`
      : formatNumber(energy);

  $: shardLabel = `${formatNumber(shards)} ${walletCurrency.toUpperCase()}`;
</script>

<Panel title="Player stats" className="profile-panel profile-stats panel-glass">
  <div class="stat-grid">
    <article class="stat-card">
      <p class="label">Level</p>
      <p class="value">{formatNumber(level)}</p>
    </article>
    <article class="stat-card">
      <p class="label">XP</p>
      <p class="value">{formatNumber(xp)}</p>
      {#if xpTarget > 0}
        <p class="sub">Next: {formatNumber(xpNext)}</p>
      {/if}
    </article>
    <article class="stat-card">
      <p class="label">Energy</p>
      <p class="value">{energyLabel}</p>
    </article>
    <article class="stat-card">
      <p class="label">Shards</p>
      <p class="value">{shardLabel}</p>
    </article>
  </div>

  <div
    class="xp-progress"
    role="progressbar"
    aria-label="Bond level progress"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={xpPercent}
  >
    <div class="xp-bar">
      <span style={`width:${xpPercent}%`} />
    </div>
    <p class="xp-label">{xpLabel}</p>
  </div>
</Panel>

<style>
  :global(.profile-panel.profile-stats > div) {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .stat-card {
    padding: 0.9rem 1rem;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.02);
  }

  .label {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
  }

  .value {
    margin: 0.2rem 0 0;
    font-size: 1.35rem;
    font-weight: 600;
  }

  .sub {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .xp-progress {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .xp-bar {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    position: relative;
  }

  .xp-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #5ef2ff, #9b5cff);
    transition: width 220ms ease;
  }

  .xp-label {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.75);
  }
</style>
