<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PrimaryAction } from '$lib/home/fieldEngine';

  export let label = 'Do this now';
  export let intent: PrimaryAction = 'MICRO_RITUAL';
  export let x = 50;
  export let y = 83;

  const dispatch = createEventDispatcher<{ activate: { intent: PrimaryAction } }>();
</script>

<button
  class="halo"
  style={`left:${x}%; top:${y}%;`}
  type="button"
  on:click={() => dispatch('activate', { intent })}
  aria-label={label}
>
  <span class="halo__inner">{label}</span>
</button>

<style>
  .halo {
    position: absolute;
    transform: translate(-50%, -50%);
    width: min(88vw, 22rem);
    min-height: 3.2rem;
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.55);
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.94));
    color: rgba(2, 6, 23, 0.95);
    box-shadow: 0 14px 30px rgba(45, 212, 191, 0.3);
    z-index: 6;
    padding: 0.18rem;
  }

  .halo__inner {
    display: grid;
    place-items: center;
    min-height: 2.8rem;
    border-radius: 999px;
    font-size: 0.96rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    background: linear-gradient(145deg, rgba(236, 253, 245, 0.3), rgba(255, 255, 255, 0));
  }
</style>
