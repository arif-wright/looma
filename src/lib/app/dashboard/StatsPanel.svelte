<script lang="ts">
  import { onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import StatBadge from '$lib/app/components/StatBadge.svelte';

  type Stats = {
    missions_completed: number;
    encounters_logged: number;
    success_rate: number;
    streak_days: number;
  };

  let loading = true;
  let error: string | null = null;
  let stats: Stats | null = null;

  async function loadData() {
    loading = true;
    error = null;
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No session');

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('missions_completed, encounters_logged, success_rate, streak_days')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      stats = (data as Stats) ?? {
        missions_completed: 0,
        encounters_logged: 0,
        success_rate: 0,
        streak_days: 0
      };
    } catch (err) {
      console.error('StatsPanel load error:', err);
      error = err instanceof Error ? err.message : 'Failed to load stats';
    } finally {
      loading = false;
    }
  }

  onMount(loadData);
</script>

<PanelFrame title="Stats" {loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" class="retry-button" on:click={loadData}>Retry</button>
    </div>
  {:else if stats}
    <div class="stats-grid" aria-live="polite">
      <StatBadge label="Missions" value={stats.missions_completed} />
      <StatBadge label="Encounters" value={stats.encounters_logged} />
      <StatBadge label="Success" value={`${Math.round(stats.success_rate)}%`} />
      <StatBadge label="Streak" value={`${stats.streak_days}d`} />
    </div>
  {/if}

  <svelte:fragment slot="skeleton">
    <div class="skeleton">
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
      <div class="skeleton-pill"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  @media (min-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #fca5a5;
  }

  .retry-button {
    background: none;
    border: 0;
    color: rgba(233, 195, 255, 0.85);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }

  .retry-button:hover,
  .retry-button:focus-visible {
    color: #ffffff;
  }

  .skeleton {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  @media (min-width: 768px) {
    .skeleton {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .skeleton-pill {
    height: 2.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    animation: pulse 1.3s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-pill {
      animation: none;
    }
  }
</style>
