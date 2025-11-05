<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type FilterChip = { id: string; label: string };
  export type SortOption = { id: string; label: string };

  export let categories: FilterChip[] = [];
  export let activeCategory: string;
  export let rarities: FilterChip[] = [];
  export let activeRarity: string;
  export let sortOptions: SortOption[] = [];
  export let activeSort: string;

  const dispatch = createEventDispatcher<{
    category: { id: string };
    rarity: { id: string };
    sort: { id: string };
  }>();

  const changeCategory = (id: string) => dispatch('category', { id });
  const changeRarity = (id: string) => dispatch('rarity', { id });
  const changeSort = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement | null)?.value ?? activeSort;
    dispatch('sort', { id: value });
  };
</script>

<section class="filter-bar panel-glass" aria-label="Shop filters">
  <div class="filter-group" role="group" aria-label="Filter by category">
    {#each categories as chip (chip.id)}
      <button
        type="button"
        class={`filter-chip ${activeCategory === chip.id ? 'active' : ''}`}
        on:click={() => changeCategory(chip.id)}
      >
        {chip.label}
      </button>
    {/each}
  </div>

  <div class="filter-group" role="group" aria-label="Filter by rarity">
    {#each rarities as chip (chip.id)}
      <button
        type="button"
        class={`filter-chip ${activeRarity === chip.id ? 'active' : ''}`}
        on:click={() => changeRarity(chip.id)}
      >
        {chip.label}
      </button>
    {/each}
  </div>

  <label class="sort-field">
    <span class="sort-label">Sort by</span>
    <select on:change={changeSort} bind:value={activeSort}>
      {#each sortOptions as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </label>
</section>

<style>
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 1.2rem;
    align-items: center;
    padding: 1.3rem clamp(1.1rem, 2.5vw, 1.8rem);
  }

  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .filter-chip {
    padding: 0.5rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 28, 0.55);
    color: rgba(248, 250, 255, 0.75);
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition: background 160ms ease, border 160ms ease, color 160ms ease, transform 160ms ease;
  }

  .filter-chip.active {
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    color: rgba(8, 10, 22, 0.9);
    border-color: transparent;
    box-shadow: 0 14px 26px rgba(94, 242, 255, 0.35);
  }

  .filter-chip:hover,
  .filter-chip:focus-visible {
    transform: translateY(-2px);
    outline: none;
    border-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }

  .sort-field {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.65);
  }

  .sort-field select {
    background: rgba(8, 12, 28, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    padding: 0.5rem 1.1rem;
    color: rgba(248, 250, 255, 0.85);
  }

  .sort-field select:focus-visible {
    outline: none;
    border-color: rgba(94, 242, 255, 0.8);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.25);
  }

  @media (max-width: 960px) {
    .filter-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .sort-field {
      margin-left: 0;
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .filter-chip,
    .sort-field select {
      transition: none;
    }
  }
</style>
