<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type Category = 'all' | 'cosmetic' | 'boost' | 'bundle' | 'token' | 'other';
  export type Rarity = 'all' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  export type SortKey = 'newest' | 'priceAsc' | 'priceDesc' | 'rarity';

  export type FilterState = {
    category: Category;
    rarity: Rarity;
    sortKey: SortKey;
  };

  const defaultState: FilterState = { category: 'all', rarity: 'all', sortKey: 'newest' };

  export let current: FilterState = defaultState;

  const dispatcher = createEventDispatcher<{ change: FilterState }>();

  const categories: Category[] = ['all', 'cosmetic', 'boost', 'bundle', 'token', 'other'];
  const rarities: Rarity[] = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const sorts: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'priceAsc', label: 'Price: Low → High' },
    { value: 'priceDesc', label: 'Price: High → Low' },
    { value: 'rarity', label: 'Rarity' }
  ];

  $: state = {
    category: current?.category ?? defaultState.category,
    rarity: current?.rarity ?? defaultState.rarity,
    sortKey: current?.sortKey ?? defaultState.sortKey
  };

  const notify = (next: FilterState) => dispatcher('change', next);

  const setCategory = (value: Category) => {
    if (state.category === value) return;
    notify({ ...state, category: value });
  };

  const onRarityChange = (event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    const value = target.value as Rarity;
    if (value === state.rarity) return;
    notify({ ...state, rarity: value });
  };

  const onSortChange = (event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    const value = target.value as SortKey;
    if (value === state.sortKey) return;
    notify({ ...state, sortKey: value });
  };
</script>

<nav role="region" aria-label="Shop filters" class="filter-bar flex flex-wrap items-center gap-2 mb-3 md:mb-4">
  <div class="categories">
    {#each categories as option}
      <button
        class={`pill ${state.category === option ? 'active' : ''}`}
        type="button"
        aria-pressed={state.category === option}
        aria-label={`Filter by ${option}`}
        on:click={() => setCategory(option)}
      >
        {option.charAt(0).toUpperCase() + option.slice(1)}
      </button>
    {/each}
  </div>

  <div class="divider" aria-hidden="true"></div>

  <label class="field">
    <span>Rarity</span>
    <select class="select" value={state.rarity} on:change={onRarityChange}>
      {#each rarities as option}
        <option value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
      {/each}
    </select>
  </label>

  <div class="divider" aria-hidden="true"></div>

  <label class="field">
    <span>Sort</span>
    <select class="select" value={state.sortKey} on:change={onSortChange}>
      {#each sorts as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>
</nav>

<style>
  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .pill {
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.25);
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.8rem;
    font-weight: 500;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .pill:hover,
  .pill:focus-visible {
    background: rgba(148, 163, 184, 0.18);
    color: rgba(255, 255, 255, 0.95);
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  .pill.active {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.12);
  }

  .field {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .field span {
    font-size: 0.7rem;
  }

  .select {
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.25);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
    outline: none;
  }

  .select:focus-visible {
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  @media (max-width: 560px) {
    .filter-bar {
      flex-direction: column;
      align-items: flex-start;
    }

    .divider {
      display: none;
    }
  }
</style>
