<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id = 'seed';
  export let label = 'Seed';
  export let href = '/app/home';
  export let relevance = 0.5;
  export let x = 50;
  export let y = 50;
  export let exploreMode = false;

  const dispatch = createEventDispatcher<{ follow: { id: string; href: string } }>();

  $: brightness = Math.max(0.24, Math.min(1, relevance + (exploreMode ? 0.35 : 0)));
</script>

<a
  class="seed"
  style={`left:${x}%; top:${y}%; --seed-bright:${brightness};`}
  href={href}
  on:click={() => dispatch('follow', { id, href })}
  aria-label={`Open ${label}`}
>
  <span class="seed__dot"></span>
  <span class="seed__label">{label}</span>
</a>

<style>
  .seed {
    position: absolute;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    text-decoration: none;
    color: rgba(226, 232, 240, calc(0.58 + var(--seed-bright) * 0.3));
    z-index: 4;
    transition: transform 140ms ease;
  }

  .seed__dot {
    width: 0.74rem;
    height: 0.74rem;
    border-radius: 999px;
    background: rgba(125, 211, 252, calc(0.16 + var(--seed-bright) * 0.8));
    box-shadow: 0 0 14px rgba(56, 189, 248, calc(0.18 + var(--seed-bright) * 0.42));
  }

  .seed__label {
    font-size: 0.74rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: calc(0.2 + var(--seed-bright));
  }

  .seed:hover,
  .seed:focus-visible {
    transform: translate(-50%, -50%) scale(1.04);
    outline: none;
  }
</style>
