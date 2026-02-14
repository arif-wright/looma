<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomePrimaryIntent } from '$lib/components/home/homeLoopTypes';

  export let intent: HomePrimaryIntent = 'quick_spark';
  export let label = 'Quick Spark (60 sec)';
  export let helper = 'One small action to stay connected.';
  export let busy = false;

  const dispatch = createEventDispatcher<{ action: { intent: HomePrimaryIntent } }>();
</script>

<section class="card action" aria-label="Primary action">
  <p class="action__eyebrow">Act</p>
  <h2>Do this now</h2>
  <p class="action__helper">{helper}</p>
  <button type="button" class="action__cta" on:click={() => dispatch('action', { intent })} disabled={busy}>
    {label}
  </button>
</section>

<style>
  .card {
    border-radius: 1.2rem;
    border: 1px solid rgba(125, 211, 252, 0.35);
    background: linear-gradient(164deg, rgba(8, 30, 56, 0.9), rgba(17, 43, 78, 0.86));
    padding: 1rem;
    box-shadow: 0 20px 46px rgba(14, 116, 144, 0.3);
  }

  .action__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(125, 211, 252, 0.9);
  }

  h2 {
    margin: 0.28rem 0 0;
    font-size: 1.18rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .action__helper {
    margin: 0.55rem 0 0;
    color: rgba(203, 213, 225, 0.86);
    font-size: 0.88rem;
    line-height: 1.35;
  }

  .action__cta {
    margin-top: 0.85rem;
    width: 100%;
    min-height: 3rem;
    border: none;
    border-radius: 0.95rem;
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.98), rgba(56, 189, 248, 0.95));
    color: rgba(7, 17, 36, 0.95);
    font-weight: 700;
    font-size: 0.96rem;
    letter-spacing: 0.01em;
    box-shadow: 0 14px 24px rgba(45, 212, 191, 0.22);
  }

  .action__cta:disabled {
    opacity: 0.75;
  }
</style>
