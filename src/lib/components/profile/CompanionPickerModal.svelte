<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export type CompanionOption = {
    id: string;
    name: string;
    species: string;
    avatar_url: string | null;
    mood: string;
    bond_level: number;
  };

  export let open = false;
  export let companions: CompanionOption[] = [];
  export let busy = false;

  const dispatch = createEventDispatcher<{ close: void; select: { id: string } }>();

  let activeIndex = 0;

  $: if (open) {
    activeIndex = 0;
  }

  const handleSelect = (id: string) => {
    if (busy) return;
    dispatch('select', { id });
  };
</script>

{#if open}
  <div class="picker-overlay" role="dialog" aria-modal="true">
    <div class="picker panel-glass">
      <header>
        <h2>Choose companion</h2>
        <button type="button" class="ghost-btn" on:click={() => dispatch('close')} aria-label="Close companion picker">
          Close
        </button>
      </header>

      {#if companions.length === 0}
        <p class="empty">No companions yet. Hatch or bond with a creature to feature it here.</p>
      {:else}
        <ul class="companion-grid">
          {#each companions as companion, index (companion.id)}
            <li>
              <button
                type="button"
                class={`card ${index === activeIndex ? 'active' : ''}`}
                on:click={() => {
                  activeIndex = index;
                  handleSelect(companion.id);
                }}
                disabled={busy}
              >
                <img
                  src={companion.avatar_url ?? '/avatar.svg'}
                  alt={companion.name}
                  width="72"
                  height="72"
                  loading="lazy"
                />
                <div>
                  <p class="name">{companion.name}</p>
                  <p class="species">{companion.species}</p>
                  <p class="mood">{companion.mood}</p>
                  <span class="level">Lv {companion.bond_level}</span>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 7, 18, 0.78);
    backdrop-filter: blur(18px);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1.5rem;
    z-index: 1000;
  }

  .picker {
    width: min(720px, 100%);
    max-height: 80vh;
    overflow: auto;
    padding: 1.5rem;
    display: grid;
    gap: 1rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .companion-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .card {
    width: 100%;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    padding: 0.85rem;
    display: flex;
    gap: 0.75rem;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }

  .card.active {
    border-color: rgba(94, 242, 255, 0.6);
    box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.3);
  }

  .card img {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .name {
    margin: 0;
    font-weight: 600;
  }

  .species,
  .mood {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.78);
  }

  .level {
    display: inline-flex;
    margin-top: 0.35rem;
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.75rem;
  }

  .ghost-btn {
    padding: 0.35rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    cursor: pointer;
  }

  .empty {
    margin: 1rem 0 0;
    opacity: 0.75;
  }
</style>
