<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let open = false;
  export let selectedMood: HomeMood | null = null;
  export let orbX = 50;
  export let orbY = 44;
  export let fading = false;

  const dispatch = createEventDispatcher<{ select: { mood: HomeMood } }>();

  const moods: Array<{ mood: HomeMood; label: string; angle: number }> = [
    { mood: 'calm', label: 'Calm', angle: -14 },
    { mood: 'heavy', label: 'Heavy', angle: 214 },
    { mood: 'curious', label: 'Curious', angle: 64 },
    { mood: 'energized', label: 'Energized', angle: -84 },
    { mood: 'numb', label: 'Numb', angle: 140 }
  ];

  const radius = 18;

  const pointFor = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: orbX + Math.cos(rad) * radius,
      y: orbY + Math.sin(rad) * radius
    };
  };
</script>

{#if open}
  <div class={`mood-seeds ${fading ? 'mood-seeds--fade' : ''}`} aria-label="Mood check-in">
    <p class="mood-seeds__title" style={`left:${orbX}%; top:${Math.max(10, orbY - 18)}%;`}>How are you arriving?</p>
    {#each moods as item}
      {@const p = pointFor(item.angle)}
      <button
        type="button"
        class={`mood ${selectedMood === item.mood ? 'mood--active' : ''}`}
        style={`left:${p.x}%; top:${p.y}%;`}
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
    inset: 0;
    z-index: 7;
    transition: opacity 260ms ease, transform 260ms ease;
  }

  .mood-seeds--fade {
    opacity: 0;
    transform: scale(0.97);
  }

  .mood-seeds__title {
    position: absolute;
    transform: translate(-50%, -50%);
    margin: 0;
    color: rgba(224, 242, 254, 0.94);
    font-size: 0.84rem;
    font-weight: 600;
    text-shadow: 0 0 14px rgba(56, 189, 248, 0.22);
  }

  .mood {
    position: absolute;
    transform: translate(-50%, -50%);
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
