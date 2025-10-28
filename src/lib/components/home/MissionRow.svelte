<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export type MissionItem = {
    id: string;
    title?: string | null;
    summary?: string | null;
    difficulty?: string | null;
    energy_reward?: number | null;
    xp_reward?: number | null;
  };

  export let items: MissionItem[] = [];

  const dispatch = createEventDispatcher<{ start: { missionId: string } }>();

  const readableDifficulty = (value: string | null | undefined) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Flexible';
</script>

{#if items.length === 0}
  <div class="empty">
    <p>No suggested missions right now.</p>
    <a href="/app/missions" class="cta">Browse missions</a>
  </div>
{:else}
  <ul class="mission-row">
    {#each items as mission (mission.id)}
      <li>
        <article class="mission-card">
          <header>
            <h3>{mission.title ?? 'Mission'}</h3>
            <span class="pill">{readableDifficulty(mission.difficulty)}</span>
          </header>
          {#if mission.summary}
            <p class="summary">{mission.summary}</p>
          {/if}
          <dl class="rewards">
            {#if mission.energy_reward !== undefined && mission.energy_reward !== null}
              <div>
                <dt>Energy</dt>
                <dd>{mission.energy_reward}</dd>
              </div>
            {/if}
            {#if mission.xp_reward !== undefined && mission.xp_reward !== null}
              <div>
                <dt>XP</dt>
                <dd>{mission.xp_reward}</dd>
              </div>
            {/if}
          </dl>
          <button type="button" on:click={() => dispatch('start', { missionId: mission.id })}>
            Start mission
          </button>
        </article>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .mission-row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }

  .mission-card {
    padding: 18px;
    border-radius: 18px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.65);
    display: grid;
    gap: 12px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .pill {
    display: inline-flex;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.15);
    color: rgba(191, 219, 254, 0.9);
    font-size: 0.75rem;
  }

  .summary {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .rewards {
    display: flex;
    gap: 16px;
  }

  .rewards div {
    display: grid;
    gap: 4px;
  }

  dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.75);
  }

  dd {
    margin: 0;
    font-weight: 600;
  }

  button {
    border-radius: 12px;
    padding: 10px 14px;
    border: 1px solid rgba(56, 189, 248, 0.6);
    background: rgba(56, 189, 248, 0.18);
    color: rgba(226, 232, 240, 0.95);
    font-size: 0.9rem;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: rgba(56, 189, 248, 0.28);
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

  .cta {
    display: inline-flex;
    justify-content: center;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    text-decoration: none;
    color: rgba(226, 232, 240, 0.9);
  }

  .cta:hover,
  .cta:focus-visible {
    border-color: rgba(56, 189, 248, 0.6);
    color: rgba(125, 211, 252, 0.9);
  }
</style>
