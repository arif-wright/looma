<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PlayerStats } from '$lib/server/queries/getPlayerStats';

  export type MissionSnippet = {
    id: string;
    title?: string | null;
    summary?: string | null;
    difficulty?: string | null;
  } | null;

  export type CreatureSnippet = {
    id: string;
    name?: string | null;
    species?: string | null;
    mood?: string | null;
    mood_label?: string | null;
  } | null;

  export let stats: PlayerStats | null = null;
  export let mission: MissionSnippet = null;
  export let creature: CreatureSnippet = null;
  export let variant: 'A' | 'B' | 'C' | null = null;

  const dispatch = createEventDispatcher<{
    claim: void;
    startMission: { missionId: string };
    checkCreature: { creatureId: string };
  }>();

  const energy = stats?.energy ?? 0;
  const energyMax = stats?.energy_max ?? 0;
  const energyPercent = energyMax > 0 ? Math.round((energy / energyMax) * 100) : null;
  const streak = stats?.missions_completed ?? 0;

  const missionTitle = mission?.title ?? 'No mission queued';
  const missionDiff = mission?.difficulty ? mission.difficulty.toLowerCase() : null;

  const creatureMood = creature?.mood_label ?? creature?.mood ?? 'Content';
</script>

<article class="today-card" aria-labelledby="today-heading">
  <header class="today-header">
    <div>
      <h2 id="today-heading">Today&apos;s boost</h2>
      <p class="variant">
        Variant <span aria-hidden="true">•</span> {variant ?? 'C'}
      </p>
    </div>
    <button
      type="button"
      class="claim"
      on:click={() => dispatch('claim')}
      aria-label="Claim daily bond"
    >
      Claim daily bond
    </button>
  </header>

  <section class="stat-grid" aria-label="Daily readiness">
    <div class="stat-tile">
      <span class="label">Energy</span>
      <strong class="value">
        {energyMax > 0 ? `${energy}/${energyMax}` : energy}
      </strong>
      {#if energyPercent !== null}
        <div class="meter" role="progressbar" aria-valuenow={energyPercent} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${Math.min(100, Math.max(0, energyPercent))}%`}></span>
        </div>
      {/if}
    </div>
    <div class="stat-tile">
      <span class="label">Streak</span>
      <strong class="value">{streak} days</strong>
      <p class="hint">Keep the momentum going</p>
    </div>
  </section>

  <section class="mission-highlight" aria-label="Suggested mission">
    <div>
      <h3>Next mission</h3>
      <p class="mission-title">{missionTitle}</p>
      {#if mission?.summary}
        <p class="summary">{mission.summary}</p>
      {/if}
      <p class="badge">
        {missionDiff ? missionDiff : 'Ready'}
      </p>
    </div>
    <button
      type="button"
      class="start"
      on:click={() => mission?.id && dispatch('startMission', { missionId: mission.id })}
      disabled={!mission?.id}
    >
      {mission?.id ? 'Resume' : 'Browse missions'}
    </button>
  </section>

  <section class="creature-highlight" aria-label="Companion snapshot">
    <div>
      <h3>Creature mood</h3>
      <p class="creature-name">
        {creature?.name ?? 'Companion'}
        <span class="mood"> — {creatureMood}</span>
      </p>
      {#if creature?.species}
        <p class="summary species">{creature.species}</p>
      {/if}
    </div>
    <button
      type="button"
      class="caret"
      on:click={() => creature?.id && dispatch('checkCreature', { creatureId: creature.id })}
    >
      Check in
    </button>
  </section>
</article>

<style>
  .today-card {
    display: grid;
    gap: 20px;
    padding: 24px;
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 118, 110, 0.35));
    box-shadow: 0 30px 40px rgba(15, 23, 42, 0.35);
    color: rgb(226, 232, 240);
  }

  .today-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .today-header h2 {
    margin: 0 0 6px;
    font-size: 1.35rem;
  }

  .variant {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.75);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .claim {
    background: rgba(56, 189, 248, 0.2);
    border: 1px solid rgba(56, 189, 248, 0.5);
    color: rgb(226, 252, 236);
    padding: 10px 16px;
    border-radius: 999px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .claim:hover,
  .claim:focus-visible {
    background: rgba(56, 189, 248, 0.3);
  }

  .stat-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .stat-tile {
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.55);
    padding: 16px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: grid;
    gap: 6px;
  }

  .label {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .value {
    font-size: 1.3rem;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .meter {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(45, 212, 191, 0.85), rgba(59, 130, 246, 0.85));
  }

  .mission-highlight,
  .creature-highlight {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border-radius: 18px;
    padding: 18px;
    background: rgba(30, 41, 59, 0.55);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .mission-highlight h3,
  .creature-highlight h3 {
    margin: 0 0 6px;
    font-size: 1rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .mission-title,
  .creature-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .summary {
    margin: 6px 0 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .summary.species {
    font-style: italic;
  }

  .badge {
    margin: 8px 0 0;
    display: inline-flex;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: rgba(45, 212, 191, 0.18);
    border: 1px solid rgba(45, 212, 191, 0.4);
  }

  .start,
  .caret {
    border-radius: 999px;
    padding: 10px 18px;
    font-size: 0.85rem;
    border: 1px solid rgba(94, 234, 212, 0.5);
    background: rgba(94, 234, 212, 0.18);
    color: rgb(226, 252, 236);
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .start:hover:not(:disabled),
  .start:focus-visible,
  .caret:hover,
  .caret:focus-visible {
    background: rgba(94, 234, 212, 0.28);
    transform: translateY(-1px);
  }

  .start:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .creature-name {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .mood {
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.7);
  }

  @media (max-width: 640px) {
    .today-card {
      padding: 18px;
    }

    .mission-highlight,
    .creature-highlight {
      flex-direction: column;
      align-items: stretch;
    }

    .start,
    .caret {
      width: 100%;
      justify-content: center;
    }
  }
</style>
