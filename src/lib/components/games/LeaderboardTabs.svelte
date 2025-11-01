<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { LeaderboardScope } from '$lib/server/games/leaderboard';

  export let active: LeaderboardScope = 'alltime';

  const dispatch = createEventDispatcher<{ change: LeaderboardScope }>();

  const tabs: Array<{ scope: LeaderboardScope; label: string }> = [
    { scope: 'daily', label: 'Daily' },
    { scope: 'weekly', label: 'Weekly' },
    { scope: 'alltime', label: 'All-time' }
  ];

  const select = (scope: LeaderboardScope) => {
    if (scope === active) return;
    dispatch('change', scope);
  };
</script>

<div class="tabs" role="tablist" data-testid="leaderboard-tabs">
  {#each tabs as tab}
    <button
      type="button"
      role="tab"
      class={`tab ${tab.scope === active ? 'tab--active' : ''}`}
      aria-selected={tab.scope === active}
      on:click={() => select(tab.scope)}
      data-scope={tab.scope}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: inline-flex;
    gap: 0.25rem;
    background: rgba(11, 17, 34, 0.7);
    padding: 0.35rem;
    border-radius: 999px;
  }

  .tab {
    border: none;
    border-radius: 999px;
    padding: 0.4rem 0.95rem;
    font-size: 0.85rem;
    background: transparent;
    color: rgba(214, 224, 255, 0.7);
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }

  .tab:hover,
  .tab:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: white;
    outline: none;
  }

  .tab--active {
    background: linear-gradient(120deg, rgba(155, 92, 255, 0.85), rgba(77, 244, 255, 0.85));
    color: rgba(10, 14, 32, 0.9);
    font-weight: 600;
    box-shadow: 0 8px 18px rgba(77, 244, 255, 0.25);
  }
</style>
