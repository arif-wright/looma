<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let open = false;
  export let selectedMood: HomeMood | null = null;

  const dispatch = createEventDispatcher<{ select: { mood: HomeMood } }>();

  const moods: Array<{ mood: HomeMood; label: string }> = [
    { mood: 'calm', label: 'Calm' },
    { mood: 'heavy', label: 'Heavy' },
    { mood: 'curious', label: 'Curious' },
    { mood: 'energized', label: 'Energized' },
    { mood: 'numb', label: 'Numb' }
  ];
</script>

{#if open}
  <div class="mood-seeds" aria-label="Mood check-in">
    {#each moods as item}
      <button
        type="button"
        class={`mood ${selectedMood === item.mood ? 'mood--active' : ''}`}
        on:click={() => dispatch('select', { mood: item.mood })}
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .mood-seeds {
    position: absolute;
    left: 50%;
    top: 67%;
    transform: translateX(-50%);
    width: min(92vw, 25rem);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.46rem;
    z-index: 7;
  }

  .mood {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.36);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(226, 232, 240, 0.95);
    min-height: 2rem;
    padding: 0 0.7rem;
    font-size: 0.78rem;
  }

  .mood--active {
    border-color: rgba(45, 212, 191, 0.72);
    box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.28);
  }
</style>
