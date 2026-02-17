<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CircleSummary } from './types';

  export let circles: CircleSummary[] = [];
  export let activeCircleId: string | null = null;

  const dispatch = createEventDispatcher<{
    select: { circleId: string };
    create: void;
    join: void;
  }>();
</script>

<section class="circle-list" aria-label="Your circles">
  <header>
    <h2>Circles</h2>
    <div class="actions">
      <button type="button" on:click={() => dispatch('create')}>Create</button>
      <button type="button" class="ghost" on:click={() => dispatch('join')}>Join</button>
    </div>
  </header>

  <ul>
    {#if circles.length === 0}
      <li class="empty">No circles yet.</li>
    {:else}
      {#each circles as circle (circle.circleId)}
        <li>
          <button
            type="button"
            class:active={circle.circleId === activeCircleId}
            on:click={() => dispatch('select', { circleId: circle.circleId })}
          >
            <strong>{circle.name}</strong>
            <span>{circle.memberCount} members</span>
          </button>
        </li>
      {/each}
    {/if}
  </ul>
</section>

<style>
  .circle-list {
    border-right: 1px solid rgba(189, 209, 236, 0.24);
    min-height: 0;
    display: flex;
    flex-direction: column;
    background:
      linear-gradient(182deg, rgba(18, 30, 67, 0.88), rgba(12, 21, 49, 0.9)),
      radial-gradient(circle at 8% -8%, rgba(102, 198, 188, 0.14), transparent 48%);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
  }

  h2 {
    margin: 0;
    font-family: var(--san-font-display);
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(236, 243, 253, 0.92);
  }

  .actions {
    display: inline-flex;
    gap: 0.45rem;
  }

  .actions button {
    border: 1px solid rgba(204, 225, 245, 0.4);
    border-radius: 999px;
    padding: 0.4rem 0.84rem;
    background: linear-gradient(130deg, rgba(95, 185, 255, 0.94), rgba(94, 225, 194, 0.92));
    color: rgba(9, 22, 44, 0.95);
    font-weight: 700;
    cursor: pointer;
  }

  .actions button.ghost {
    background: rgba(34, 52, 98, 0.54);
    color: rgba(236, 243, 252, 0.95);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
  }

  li button {
    width: 100%;
    text-align: left;
    border: none;
    border-top: 1px solid rgba(184, 204, 232, 0.14);
    background: transparent;
    color: rgba(235, 243, 252, 0.95);
    padding: 0.9rem 1rem;
    cursor: pointer;
    display: grid;
    gap: 0.15rem;
    transition: background 220ms var(--san-ease-out);
  }

  li button:hover,
  li button.active,
  li button:focus-visible {
    background: linear-gradient(105deg, rgba(77, 188, 175, 0.2), rgba(90, 150, 242, 0.16));
  }

  span {
    font-size: 0.82rem;
    color: rgba(191, 230, 242, 0.88);
  }

  .empty {
    padding: 1rem;
    color: rgba(148, 163, 184, 0.95);
  }
</style>
