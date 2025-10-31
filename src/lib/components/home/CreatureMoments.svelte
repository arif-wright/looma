<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type CreatureItem = {
    id: string;
    name?: string | null;
    species?: string | null;
    mood?: string | null;
    mood_label?: string | null;
    next_care_at?: string | null;
  };

  export let items: CreatureItem[] = [];

  const dispatch = createEventDispatcher<{ focus: { creatureId: string } }>();

  const dueLabel = (iso: string | null | undefined) => {
    if (!iso) return 'Rested';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'Check in soon';
    const diff = ts - Date.now();
    if (diff <= 0) return 'Care due now';
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return `Due in ${minutes}m`;
    const hours = Math.round(diff / 3600000);
    return `Due in ${hours}h`;
  };
</script>

{#if items.length === 0}
  <div class="empty">
    <p>No creatures yet.</p>
    <a href="/app/creatures">Adopt a companion</a>
  </div>
{:else}
  <ul class="creature-grid">
    {#each items as creature (creature.id)}
      <li>
        <article class="creature-card">
          <header>
            <h3>{creature.name ?? 'Companion'}</h3>
            <span class="species">{creature.species ?? 'Unknown species'}</span>
          </header>
          <p class="mood">{creature.mood_label ?? creature.mood ?? 'Content'}</p>
          <p class="status">{dueLabel(creature.next_care_at)}</p>
          <button
            type="button"
            class="visit-action btn-ripple hover-glow"
            on:click={() => dispatch('focus', { creatureId: creature.id })}
          >
            Feed &amp; play
          </button>
        </article>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .creature-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .creature-card {
    border-radius: 18px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.66);
    padding: 18px;
    display: grid;
    gap: 12px;
  }

  header {
    display: grid;
    gap: 4px;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .species {
    font-size: 0.78rem;
    color: rgba(226, 232, 255, 0.7);
  }

  .mood {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(244, 247, 255, 0.9);
  }

  .status {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 255, 0.8);
  }

  .visit-action {
    border-radius: 999px;
    padding: 0.65rem 1.25rem;
    border: 1px solid rgba(77, 244, 255, 0.45);
    background: rgba(77, 244, 255, 0.16);
    color: rgba(244, 247, 255, 0.92);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, box-shadow 200ms ease;
  }

  .visit-action:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(77, 244, 255, 0.6);
  }

  .empty {
    border-radius: 18px;
    border: 1px dashed rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.45);
    padding: 24px;
    text-align: center;
    display: grid;
    gap: 12px;
  }

  .empty a {
    display: inline-flex;
    justify-content: center;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    text-decoration: none;
    color: rgba(226, 232, 240, 0.9);
  }

  .empty a:hover,
  .empty a:focus-visible {
    border-color: rgba(56, 189, 248, 0.6);
    color: rgba(125, 211, 252, 0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    .visit-action {
      transition: none;
    }
  }
</style>
