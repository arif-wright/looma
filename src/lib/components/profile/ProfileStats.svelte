<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let shards: number | null = null;
  export let walletCurrency = 'SHARDS';

  const fmt = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';

  $: xpLabel =
    typeof xp === 'number' && typeof xpNext === 'number'
      ? `${xp.toLocaleString()} / ${xpNext.toLocaleString()} XP`
      : 'Aligning…';
  $: xpPercent =
    typeof xp === 'number' && typeof xpNext === 'number' && xpNext > 0
      ? Math.min(100, Math.round((xp / xpNext) * 100))
      : 0;
  $: energyLabel =
    typeof energy === 'number' && typeof energyMax === 'number'
      ? `${energy}/${energyMax}`
      : fmt(energy);
</script>

<Panel title="Player stats" className="profile-panel profile-stats panel-glass">
  <div class="stat-grid">
    <article>
      <p class="label">Level</p>
      <p class="value">{fmt(level)}</p>
    </article>
    <article>
      <p class="label">XP</p>
      <p class="value">{xpLabel}</p>
      <div class="xp-bar" role="progressbar" aria-valuenow={xpPercent} aria-valuemin="0" aria-valuemax="100">
        <span class="xp-fill xp-sweep" style={`width:${xpPercent}%`}></span>
      </div>
    </article>
    <article>
      <p class="label">Energy</p>
      <p class="value">{energyLabel}</p>
    </article>
    <article>
      <p class="label">Shards</p>
      <p class="value">
        {fmt(shards)} {walletCurrency?.toUpperCase?.() ?? walletCurrency}
      </p>
    </article>
  </div>
</Panel>

<style>
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.85rem;
  }

  article {
    padding: 0.8rem;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.02);
    display: grid;
    gap: 0.35rem;
  }

  .label {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .value {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .xp-bar {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .xp-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.8), rgba(155, 92, 255, 0.85));
    transition: width 180ms ease;
  }
</style>
