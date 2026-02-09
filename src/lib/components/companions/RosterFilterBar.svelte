<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type RosterFilterState = {
    search: string;
    archetype: string;
    mood: string;
    sort: 'bond_desc' | 'newest' | 'energy';
  };

  export let filters: RosterFilterState = {
    search: '',
    archetype: 'all',
    mood: 'all',
    sort: 'bond_desc'
  };

  export let archetypes: string[] = [];
  export let moods: string[] = [];

  const dispatch = createEventDispatcher<{ change: RosterFilterState }>();

  const update = (partial: Partial<RosterFilterState>) => {
    dispatch('change', { ...filters, ...partial });
  };
</script>

<div class="filter-bar" aria-label="Filter companions">
  <label class="filter-field">
    <span>Search</span>
    <input
      type="search"
      placeholder="Search by name"
      value={filters.search}
      on:input={(event) => update({ search: (event.currentTarget as HTMLInputElement).value })}
    />
  </label>
  <label class="filter-field">
    <span>Archetype</span>
    <select value={filters.archetype} on:change={(event) => update({ archetype: (event.currentTarget as HTMLSelectElement).value })}>
      <option value="all">All</option>
      {#each archetypes as archetype}
        <option value={archetype}>{archetype}</option>
      {/each}
    </select>
  </label>
  <label class="filter-field">
    <span>Mood</span>
    <select value={filters.mood} on:change={(event) => update({ mood: (event.currentTarget as HTMLSelectElement).value })}>
      <option value="all">All</option>
      {#each moods as mood}
        <option value={mood}>{mood}</option>
      {/each}
    </select>
  </label>
  <label class="filter-field">
    <span>Sort</span>
    <select value={filters.sort} on:change={(event) => update({ sort: (event.currentTarget as HTMLSelectElement).value as RosterFilterState['sort'] })}>
      <option value="bond_desc">Bond level</option>
      <option value="newest">Newest</option>
      <option value="energy">Energy</option>
    </select>
  </label>
</div>

<style>
  .filter-bar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    padding: 1.5rem;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 12, 24, 0.65);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .filter-field {
    display: grid;
    gap: 0.5rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(226, 232, 255, 0.65);
  }

  .filter-field input,
  .filter-field select {
    border-radius: 999px;
    padding: 0.5rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(15, 18, 34, 0.85);
    color: rgba(247, 250, 255, 0.92);
    font-size: 0.95rem;
  }

  .filter-field input:focus-visible,
  .filter-field select:focus-visible {
    outline: none;
    border-color: rgba(91, 206, 255, 0.8);
    box-shadow: 0 0 0 2px rgba(91, 206, 255, 0.25);
  }

  @media (max-width: 640px) {
    .filter-bar {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      padding: 1rem;
    }
  }
</style>
