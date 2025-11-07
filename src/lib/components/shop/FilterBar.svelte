<script lang="ts">
  export type Category = 'all' | 'cosmetic' | 'boost' | 'bundle' | 'token' | 'other';
  export type Rarity = 'all' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  export type SortKey = 'newest' | 'priceAsc' | 'priceDesc' | 'rarity';

  export let category: Category = 'all';
  export let rarity: Rarity = 'all';
  export let sortKey: SortKey = 'newest';
  export let onChange: (state: { category: Category; rarity: Rarity; sortKey: SortKey }) => void = () => {};

  const categories: Category[] = ['all', 'cosmetic', 'boost', 'bundle', 'token', 'other'];
  const rarities: Rarity[] = ['all', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const sorts: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'priceAsc', label: 'Price: Low → High' },
    { value: 'priceDesc', label: 'Price: High → Low' },
    { value: 'rarity', label: 'Rarity' }
  ];

  const notify = () => onChange?.({ category, rarity, sortKey });

  const setCategory = (next: Category) => {
    if (category === next) return;
    category = next;
    notify();
  };

  const onRarityChange = (event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    rarity = target.value as Rarity;
    notify();
  };

  const onSortChange = (event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    sortKey = target.value as SortKey;
    notify();
  };
</script>

<div class="filters">
  <div class="categories">
    {#each categories as option}
      <button
        class={`pill ${category === option ? 'active' : ''}`}
        type="button"
        aria-pressed={category === option}
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
    <select class="select" bind:value={rarity} on:change={onRarityChange}>
      {#each rarities as option}
        <option value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
      {/each}
    </select>
  </label>

  <div class="divider" aria-hidden="true"></div>

  <label class="field">
    <span>Sort</span>
    <select class="select" bind:value={sortKey} on:change={onSortChange}>
      {#each sorts as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>
</div>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 1.25rem;
  }

  .categories {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pill {
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.25);
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.85rem;
    font-weight: 500;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    outline: none;
  }

  .pill:hover,
  .pill:focus-visible {
    background: rgba(148, 163, 184, 0.18);
    color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  .pill.active {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.95);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: rgba(255, 255, 255, 0.12);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .field span {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .select {
    height: 36px;
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
    .filters {
      flex-direction: column;
      align-items: flex-start;
    }

    .divider {
      display: none;
    }
  }
</style>
