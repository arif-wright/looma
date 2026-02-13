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
    border-right: 1px solid rgba(148, 163, 184, 0.18);
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.45);
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
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .actions {
    display: inline-flex;
    gap: 0.45rem;
  }

  .actions button {
    border: none;
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    background: #22d3ee;
    color: #083344;
    font-weight: 700;
    cursor: pointer;
  }

  .actions button.ghost {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
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
    border-top: 1px solid rgba(148, 163, 184, 0.13);
    background: transparent;
    color: #e2e8f0;
    padding: 0.8rem 1rem;
    cursor: pointer;
    display: grid;
    gap: 0.15rem;
  }

  li button:hover,
  li button.active,
  li button:focus-visible {
    background: rgba(56, 189, 248, 0.17);
  }

  span {
    font-size: 0.82rem;
    color: rgba(186, 230, 253, 0.88);
  }

  .empty {
    padding: 1rem;
    color: rgba(148, 163, 184, 0.95);
  }
</style>
