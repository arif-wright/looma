<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let selectedMood: HomeMood | null = null;
  export let hasCheckedInToday = false;
  export let attunementLine: string | null = null;
  export let submitting = false;

  const dispatch = createEventDispatcher<{ select: { mood: HomeMood } }>();

  const moods: Array<{ key: HomeMood; label: string }> = [
    { key: 'calm', label: 'Calm' },
    { key: 'heavy', label: 'Heavy' },
    { key: 'curious', label: 'Curious' },
    { key: 'energized', label: 'Energized' },
    { key: 'numb', label: 'Numb' }
  ];

  const chooseMood = (mood: HomeMood) => {
    if (hasCheckedInToday || submitting) return;
    dispatch('select', { mood });
  };
</script>

<section class="card arrival" aria-label="Arrival check-in">
  <header class="arrival__head">
    <p class="arrival__eyebrow">Arrival</p>
    <h2>How are you arriving?</h2>
  </header>

  <div class="arrival__chips" aria-label="Mood options">
    {#each moods as mood}
      <button
        type="button"
        class={`chip ${selectedMood === mood.key ? 'chip--active' : ''}`}
        on:click={() => chooseMood(mood.key)}
        disabled={hasCheckedInToday || submitting}
        aria-pressed={selectedMood === mood.key}
      >
        {mood.label}
      </button>
    {/each}
  </div>

  {#if attunementLine}
    <p class="arrival__line" role="status">{attunementLine}</p>
  {:else}
    <p class="arrival__hint">One tap. Your companion will attune with you.</p>
  {/if}

  {#if hasCheckedInToday}
    <p class="arrival__done">Today&apos;s check-in is complete.</p>
  {/if}
</section>

<style>
  .card {
    border-radius: 1.2rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: linear-gradient(160deg, rgba(12, 20, 38, 0.88), rgba(19, 30, 57, 0.82));
    padding: 1rem;
    box-shadow: 0 20px 42px rgba(8, 15, 30, 0.36);
    backdrop-filter: blur(12px);
  }

  .arrival__head {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.75rem;
  }

  .arrival__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(125, 211, 252, 0.88);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.25;
    color: rgba(248, 250, 252, 0.98);
  }

  .arrival__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .chip {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.7);
    color: rgba(226, 232, 240, 0.92);
    font-size: 0.86rem;
    padding: 0.44rem 0.8rem;
    transition: transform 140ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .chip--active {
    border-color: rgba(56, 189, 248, 0.85);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35), 0 0 18px rgba(56, 189, 248, 0.2);
    transform: translateY(-1px);
    background: rgba(12, 32, 58, 0.88);
  }

  .chip:disabled {
    opacity: 0.82;
  }

  .arrival__line {
    margin: 0.75rem 0 0;
    color: rgba(186, 230, 253, 0.96);
    font-size: 0.9rem;
    animation: glowIn 280ms ease;
  }

  .arrival__hint,
  .arrival__done {
    margin: 0.75rem 0 0;
    color: rgba(203, 213, 225, 0.75);
    font-size: 0.83rem;
  }

  @keyframes glowIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
