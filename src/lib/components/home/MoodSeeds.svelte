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
    z-index: 14;
    transition: opacity 420ms cubic-bezier(0.24, 0.8, 0.34, 1), transform 420ms cubic-bezier(0.24, 0.8, 0.34, 1);
  }

  .mood-seeds--fade {
    opacity: 0;
    transform: scale(0.98);
  }

  .mood-seeds__title {
    position: absolute;
    transform: translate(-50%, -50%);
    margin: 0;
    color: rgba(237, 245, 255, 0.88);
    font-size: 0.78rem;
    font-weight: 480;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-shadow: 0 0 14px rgba(114, 206, 255, 0.2);
  }

  .mood {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    border: 1px solid rgba(178, 201, 228, 0.28);
    background: rgba(13, 19, 40, 0.55);
    color: rgba(233, 242, 254, 0.92);
    min-height: 2rem;
    padding: 0 0.72rem;
    font-size: 0.74rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    backdrop-filter: blur(3px);
    transition:
      transform 320ms cubic-bezier(0.24, 0.8, 0.34, 1),
      border-color 320ms cubic-bezier(0.24, 0.8, 0.34, 1),
      background-color 320ms cubic-bezier(0.24, 0.8, 0.34, 1);
  }

  .mood--active {
    border-color: rgba(131, 246, 219, 0.72);
    background: rgba(14, 38, 48, 0.58);
    box-shadow: 0 0 0 1px rgba(131, 246, 219, 0.24), 0 8px 22px rgba(131, 246, 219, 0.16);
  }

  .mood:hover,
  .mood:focus-visible {
    transform: translate(-50%, -50%) scale(1.04);
    outline: none;
  }
</style>
