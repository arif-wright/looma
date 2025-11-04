<script lang="ts">
  import { Rocket } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ launch: void }>();
</script>

<button type="button" class="quick-mission" on:click={() => dispatch('launch')}>
  <div class="quick-mission__icon">
    <Rocket stroke-width={1.6} />
  </div>
  <div class="quick-mission__copy">
    <span class="quick-mission__label">Quick mission</span>
    <span class="quick-mission__hint">Start a focused thread in under two minutes.</span>
  </div>
</button>

<style>
  .quick-mission {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 1rem;
    padding: 1.2rem 1.4rem;
    border-radius: 1.5rem;
    border: none;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.92), rgba(168, 85, 247, 0.88));
    color: rgba(15, 23, 42, 0.92);
    cursor: pointer;
    box-shadow: 0 24px 48px rgba(79, 70, 229, 0.38);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }

  .quick-mission:hover,
  .quick-mission:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 28px 54px rgba(56, 189, 248, 0.42);
  }

  .quick-mission:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.6), 0 28px 54px rgba(56, 189, 248, 0.42);
  }

  .quick-mission__icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: rgba(248, 250, 252, 0.2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .quick-mission__icon svg {
    width: 1.4rem;
    height: 1.4rem;
  }

  .quick-mission__label {
    display: block;
    font-size: 1rem;
    font-weight: 700;
  }

  .quick-mission__hint {
    display: block;
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.8);
  }

  @media (prefers-reduced-motion: reduce) {
    .quick-mission {
      transition: none;
    }
  }
</style>
