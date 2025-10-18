<script lang="ts">
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import type { PlayerStats } from '$lib/server/queries/getPlayerStats';

  export let stats: PlayerStats | null = null;

  const items = (stats: PlayerStats | null) => (
    stats
      ? [
          { label: 'Level', value: stats.level ?? 1 },
          { label: 'XP', value: `${stats.xp ?? 0} / ${stats.xp_next ?? 0}` },
          { label: 'Bonded', value: stats.bonded_count },
          { label: 'Triad Species', value: stats.triad_species_count },
          { label: 'Missions', value: stats.missions_completed },
          { label: 'Energy', value: `${stats.energy ?? 0} / ${stats.energy_max ?? 0}` }
        ]
      : []
  );
</script>

<PanelFrame title="Stats">
  {#if !stats}
    <div class="empty">No stats available.</div>
  {:else}
    <div class="stats-grid" aria-live="polite">
      {#each items(stats) as item}
        <div class="stat-card">
          <div class="label">{item.label}</div>
          <div class="value">{item.value}</div>
        </div>
      {/each}
    </div>
  {/if}
</PanelFrame>

<style>
  .empty {
    padding: 1.2rem 1.5rem;
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .stats-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    padding: 1rem 1.5rem 1.25rem;
  }

  .stat-card {
    border-radius: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    padding: 0.9rem;
    display: grid;
    gap: 0.4rem;
  }

  .label {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .value {
    font-size: 1.2rem;
    font-weight: 600;
  }
</style>
