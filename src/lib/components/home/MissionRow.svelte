<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { activeCompanionBonus } from '$lib/stores/companions';

  type MissionItem = {
    id: string;
    title?: string | null;
    summary?: string | null;
    difficulty?: string | null;
    energy_reward?: number | null;
    xp_reward?: number | null;
    type?: 'identity' | 'action' | 'world' | null;
    cost?: { energy?: number } | null;
  };

  export let items: MissionItem[] = [];
  export let currentEnergy: number | null = null;
  export let activeSessionByMission: Record<string, { sessionId: string; status: string } | undefined> = {};
  export let recentCompletedByMission: Record<string, { sessionId: string; completedAt: string | null } | undefined> = {};

  const dispatch = createEventDispatcher<{ start: { missionId: string } }>();

  const readableDifficulty = (value: string | null | undefined) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Flexible';
  const missionTypeLabel = (type: MissionItem['type']) =>
    type === 'identity' ? 'Identity' : type === 'world' ? 'World' : 'Action';
  const missionTypeClass = (type: MissionItem['type']) =>
    type === 'identity' ? 'type-identity' : type === 'world' ? 'type-world' : 'type-action';
  const missionTypeHint = (type: MissionItem['type']) =>
    type === 'identity' ? 'No cost' : type === 'world' ? 'Usually no cost' : 'Energy cost';
  const actionCost = (mission: MissionItem) =>
    mission.type === 'action' ? Math.max(0, Math.floor(mission.cost?.energy ?? 0)) : 0;
  const canStartMission = (mission: MissionItem) => {
    if (activeSessionByMission[mission.id]) return false;
    if (mission.type !== 'action') return true;
    if (typeof currentEnergy !== 'number') return true;
    return actionCost(mission) <= currentEnergy;
  };

  $: companionBonus = $activeCompanionBonus;
  $: xpBoost = Math.round(((companionBonus?.xpMultiplier ?? 1) - 1) * 100);
  $: missionEnergyBonus = companionBonus?.missionEnergyBonus ?? 0;
</script>

{#if items.length === 0}
  <div class="empty">
    <p>No suggested missions right now.</p>
    <a href="/app/missions" class="cta">Browse missions</a>
  </div>
{:else}
  {#if xpBoost > 0 || missionEnergyBonus > 0}
    <p class="bonus-banner">
      Companion bonus active:
      {#if xpBoost > 0}
        <span>+{xpBoost}% XP</span>
      {/if}
      {#if missionEnergyBonus > 0}
        <span>+{missionEnergyBonus} mission energy cap</span>
      {/if}
    </p>
  {/if}
  <ul class="mission-row">
    {#each items as mission (mission.id)}
      <li>
        <article class="mission-card">
          <header>
            <h3>{mission.title ?? 'Mission'}</h3>
            <div class="header-pills">
              <span class="pill">{readableDifficulty(mission.difficulty)}</span>
              <span class={`pill type-pill ${missionTypeClass(mission.type)}`}>{missionTypeLabel(mission.type)}</span>
            </div>
          </header>
          <p class="type-note">{missionTypeHint(mission.type)}</p>
          {#if mission.type === 'identity'}
            <p class="privacy-note">You control what Looma remembers.</p>
          {/if}
          {#if xpBoost > 0}
            <p class="companion-badge">+{xpBoost}% XP from bond</p>
          {/if}
          {#if mission.summary}
            <p class="summary">{mission.summary}</p>
          {/if}
          {#if mission.type === 'action'}
            <p class="action-cost">Energy cost: <strong>{actionCost(mission)}</strong></p>
            {#if typeof currentEnergy === 'number'}
              <p class="action-energy-state">Available energy: {currentEnergy}</p>
            {/if}
            {#if !canStartMission(mission)}
              <p class="action-blocked" role="alert">Not enough energy to start.</p>
            {/if}
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
          {#if missionEnergyBonus > 0}
            <p class="mission-note">Companion raises your mission energy cap by {missionEnergyBonus}.</p>
          {/if}
          {#if mission.type === 'action'}
            <p class="mission-note mission-note--strong">
              Expected rewards: +{mission.energy_reward ?? 0} energy, +{mission.xp_reward ?? 0} XP.
            </p>
          {/if}
          {#if activeSessionByMission[mission.id]}
            <p class="mission-status mission-status--active">In progress</p>
          {:else if recentCompletedByMission[mission.id]}
            <p class="mission-status mission-status--completed">Completed</p>
          {/if}
          <button
            type="button"
            class="mission-action btn-ripple hover-glow"
            on:click={() => dispatch('start', { missionId: mission.id })}
            disabled={!canStartMission(mission)}
          >
            {#if activeSessionByMission[mission.id]}
              In progress
            {:else}
              Start mission
            {/if}
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

  .bonus-banner {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.9);
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .bonus-banner span {
    color: rgba(94, 234, 212, 0.95);
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
    align-items: flex-start;
    gap: 12px;
  }

  .header-pills {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
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
    color: rgba(226, 232, 255, 0.82);
  }

  .type-pill {
    border: 1px solid transparent;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .type-identity {
    border-color: rgba(196, 181, 253, 0.42);
    background: rgba(196, 181, 253, 0.16);
    color: rgba(237, 233, 254, 0.96);
  }

  .type-action {
    border-color: rgba(251, 191, 36, 0.46);
    background: rgba(251, 191, 36, 0.16);
    color: rgba(254, 243, 199, 0.96);
  }

  .type-world {
    border-color: rgba(34, 211, 238, 0.46);
    background: rgba(34, 211, 238, 0.16);
    color: rgba(207, 250, 254, 0.96);
  }

  .type-note {
    margin: 0;
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.82);
  }

  .privacy-note {
    margin: 0;
    font-size: 0.83rem;
    color: rgba(224, 231, 255, 0.93);
  }

  .companion-badge {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.9);
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

  .mission-action {
    border-radius: 999px;
    padding: 10px 16px;
    border: 1px solid rgba(56, 189, 248, 0.55);
    background: rgba(56, 189, 248, 0.18);
    color: rgba(226, 232, 255, 0.95);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, box-shadow 200ms ease;
  }

  .mission-note {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(190, 227, 248, 0.95);
  }

  .mission-note--strong {
    color: rgba(250, 245, 255, 0.95);
  }

  .action-cost {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(254, 240, 138, 0.95);
  }

  .action-cost strong {
    color: rgba(254, 243, 199, 0.98);
  }

  .action-energy-state {
    margin: -0.25rem 0 0;
    font-size: 0.75rem;
    color: rgba(203, 213, 225, 0.92);
  }

  .action-blocked {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(254, 202, 202, 0.95);
  }

  .mission-status {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .mission-status--active {
    color: rgba(147, 197, 253, 0.98);
  }

  .mission-status--completed {
    color: rgba(134, 239, 172, 0.98);
  }

  .mission-action:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.6);
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

  @media (prefers-reduced-motion: reduce) {
    .mission-action {
      transition: none;
    }
  }
</style>
