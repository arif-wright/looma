<script lang="ts">
  import { createEventDispatcher } from 'svelte';
import type { PlayerStats } from '$lib/server/queries/getPlayerStats';
import { computeTodayCardState } from './todayCardLogic';
import { sendAnalytics } from '$lib/utils/analytics';

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

  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let streak: number | null = null;
  export let petMood: string | null = null;
export let activeMission:
  | { id: string; name?: string | null; summary?: string | null; difficulty?: string | null }
  | null = null;
export let pendingReward: { label?: string | null } | boolean = false;
export let recentFail: { missionId?: string | null; name?: string | null } | null = null;

const dispatch = createEventDispatcher<{
  claim: void;
  startMission: { missionId: string | null; mode: 'resume' | 'quick' | 'retry' };
  checkCreature: { creatureId: string };
}>();

let missionForCta: string | null = null;

$: resolvedEnergy = energy ?? stats?.energy ?? 0;
  $: resolvedEnergyMax = energyMax ?? stats?.energy_max ?? 0;
  $: energyPercent =
    resolvedEnergyMax && resolvedEnergyMax > 0
      ? Math.round((resolvedEnergy / resolvedEnergyMax) * 100)
      : null;
  $: resolvedStreak = streak ?? stats?.missions_completed ?? 0;
  $: rewardPending = typeof pendingReward === 'boolean' ? pendingReward : !!pendingReward;
  $: rewardLabel =
    typeof pendingReward === 'object' && pendingReward && typeof pendingReward.label === 'string'
      ? pendingReward.label
      : 'Bond bonus ready';
$: failMissionId =
  recentFail && typeof recentFail.missionId === 'string' ? recentFail.missionId : null;
$: failMissionName =
  recentFail && typeof recentFail.name === 'string' && recentFail.name
    ? recentFail.name
    : 'your last run';
  $: missionCandidate =
    activeMission ??
    (mission?.id
      ? {
          id: mission.id,
          name: mission.title ?? 'Mission',
          summary: mission.summary ?? null,
          difficulty: mission.difficulty ?? null
        }
      : null);
$: missionDifficulty =
  typeof missionCandidate?.difficulty === 'string'
    ? missionCandidate.difficulty
    : mission?.difficulty ?? null;
$: creatureName = creature?.name ?? 'your companion';
$: companionMood = petMood ?? creature?.mood_label ?? creature?.mood ?? 'Content';

let todayState = computeTodayCardState({
  rewardPending,
  mission: missionCandidate,
  failMissionId,
  failMissionName,
  creatureName
});

$: todayState = computeTodayCardState({
  rewardPending,
  mission: missionCandidate,
  failMissionId,
  failMissionName,
    creatureName
  });
  $: ctaState = todayState.ctaState;
  $: ctaLabel = todayState.label;
  $: ctaDisabled = todayState.disabled;
  $: secondaryTip = todayState.secondary;
  $: missionForCta = todayState.missionId;
  $: showPulse = ctaState === 'reward' || ctaState === 'retry';

  function handlePrimary() {
    if (ctaState === 'reward') {
      dispatch('claim');
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: {
          action: 'reward',
          mission_id: null,
          completed: true
        }
      });
      return;
    }

    if (ctaState === 'retry') {
      dispatch('startMission', { missionId: missionForCta, mode: 'retry' });
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: {
          action: 'retry',
          mission_id: missionForCta,
          completed: false
        }
      });
      return;
    }

    if (ctaState === 'resume') {
      dispatch('startMission', { missionId: missionForCta, mode: 'resume' });
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: {
          action: 'resume',
          mission_id: missionForCta,
          completed: false
        }
      });
      return;
    }

    dispatch('startMission', { missionId: null, mode: 'quick' });
    sendAnalytics('todaycard_cta', {
      surface: 'home',
      payload: {
        action: 'quick',
        mission_id: null,
        completed: false
      }
    });
  }

  function handleCreature() {
    if (!creature?.id) return;
    dispatch('checkCreature', { creatureId: creature.id });
  }
</script>

<article class="today-card" aria-labelledby="today-heading">
  <header class="today-header">
    <div class="stack">
      <span class="label">Hybrid Home</span>
      <h2 id="today-heading">Today&apos;s boost</h2>
      <p class="variant">
        Variant {variant ?? 'C'}
      </p>
    </div>
    <button
      type="button"
      class={`cta ${showPulse ? 'pulse' : ''}`}
      on:click={handlePrimary}
      disabled={ctaDisabled}
    >
      {ctaLabel}
    </button>
  </header>

  <section class="stat-grid" aria-label="Daily readiness">
    <div class="stat">
      <span class="stat-label">Energy</span>
      <strong class="stat-value">
        {resolvedEnergyMax > 0 ? `${resolvedEnergy}/${resolvedEnergyMax}` : resolvedEnergy}
      </strong>
      {#if energyPercent !== null}
        <div
          class="meter"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={energyPercent}
        >
          <span style={`width:${Math.min(100, Math.max(0, energyPercent))}%`}></span>
        </div>
      {/if}
    </div>

    <div class="stat">
      <span class="stat-label">Streak</span>
      <strong class="stat-value">{resolvedStreak} days</strong>
      <p class="stat-hint">Keep the loop alive</p>
    </div>
  </section>

  <section class="mission-callout" aria-label="Active mission">
    <div class="content">
      <p class="section-label">
        {ctaState === 'reward'
          ? rewardLabel
          : ctaState === 'retry'
          ? 'Bounce back'
          : 'Next mission'}
      </p>
      {#if missionCandidate?.name && ctaState !== 'reward'}
        <h3>{missionCandidate.name}</h3>
      {:else if ctaState === 'reward'}
        <h3>Daily bond bonus ready</h3>
      {:else}
        <h3>Quick win available</h3>
      {/if}

      {#if missionCandidate?.summary && ctaState !== 'reward'}
        <p class="summary">{missionCandidate.summary}</p>
      {:else if ctaState === 'retry'}
        <p class="summary">Shake off {failMissionName} and take another shot.</p>
      {:else if ctaState === 'reward'}
        <p class="summary">Claim now to boost your creature bond streak.</p>
      {:else}
        <p class="summary">Short burst missions keep your streak growing.</p>
      {/if}

      {#if missionDifficulty && ctaState !== 'reward'}
        <span class="badge">{missionDifficulty}</span>
      {/if}
    </div>
  </section>

  <section class="companion" aria-label="Companion status">
    <div>
      <p class="section-label">Companion pulse</p>
      <h3>{creature?.name ?? 'Mystery companion'}</h3>
      <p class="summary mood">{companionMood}</p>
    </div>
    <button type="button" class="companion-btn" on:click={handleCreature} disabled={!creature?.id}>
      Visit {creature?.name ?? 'habitat'}
    </button>
  </section>

  <p class="tip">{secondaryTip}</p>
</article>

<style>
  .today-card {
    display: grid;
    gap: 24px;
    padding: 24px;
    border-radius: 28px;
    background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 55%),
      radial-gradient(circle at bottom left, rgba(45, 212, 191, 0.12), transparent 50%),
      rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 28px 60px rgba(15, 23, 42, 0.45);
    color: rgba(226, 232, 240, 0.96);
  }

  .today-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .stack {
    display: grid;
    gap: 6px;
  }

  .label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(148, 163, 184, 0.7);
  }

  h2 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
  }

  .variant {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .cta {
    border: none;
    border-radius: 999px;
    padding: 12px 22px;
    font-size: 0.92rem;
    font-weight: 600;
    color: rgba(15, 23, 42, 0.92);
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(45, 212, 191, 0.95));
    cursor: pointer;
    box-shadow: 0 12px 26px rgba(56, 189, 248, 0.35);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .cta:hover:not(:disabled),
  .cta:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 18px 40px rgba(56, 189, 248, 0.4);
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: default;
    box-shadow: none;
  }

  .cta.pulse {
    animation: pulse 1.8s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 12px 26px rgba(56, 189, 248, 0.35);
      transform: translateY(0);
    }
    50% {
      box-shadow: 0 18px 36px rgba(45, 212, 191, 0.45);
      transform: translateY(-1px);
    }
  }

  .stat-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .stat {
    border-radius: 20px;
    padding: 16px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
    display: grid;
    gap: 8px;
  }

  .stat-label {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(148, 163, 184, 0.65);
  }

  .stat-value {
    font-size: 1.4rem;
  }

  .stat-hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .meter {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(45, 212, 191, 0.8), rgba(59, 130, 246, 0.85));
  }

  .mission-callout {
    border-radius: 20px;
    padding: 20px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(56, 189, 248, 0.08));
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .mission-callout .content {
    display: grid;
    gap: 10px;
  }

  .section-label {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(148, 163, 184, 0.7);
  }

  .mission-callout h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  .summary {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.78);
  }

  .summary.mood {
    font-weight: 600;
    color: rgba(191, 219, 254, 0.9);
  }

  .badge {
    justify-self: start;
    margin-top: 6px;
    padding: 3px 12px;
    border-radius: 999px;
    border: 1px solid rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.18);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .companion {
    border-radius: 20px;
    padding: 20px;
    background: rgba(15, 23, 42, 0.58);
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  .companion h3 {
    margin: 6px 0 4px;
    font-size: 1.1rem;
  }

  .companion-btn {
    border-radius: 999px;
    padding: 10px 18px;
    background: rgba(45, 212, 191, 0.16);
    border: 1px solid rgba(45, 212, 191, 0.35);
    color: rgba(204, 251, 241, 0.95);
    font-size: 0.88rem;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .companion-btn:hover,
  .companion-btn:focus-visible {
    background: rgba(45, 212, 191, 0.26);
    transform: translateY(-1px);
  }

  .companion-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .tip {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(148, 163, 184, 0.78);
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  @media (prefers-reduced-motion: reduce) {
    .cta,
    .companion-btn {
      transition: background 0.2s ease;
    }

    .cta:hover:not(:disabled),
    .cta:focus-visible,
    .companion-btn:hover,
    .companion-btn:focus-visible {
      transform: none;
    }

    .cta.pulse {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .today-card {
      padding: 20px;
    }

    .today-header {
      flex-direction: column;
      align-items: stretch;
    }

    .cta {
      width: 100%;
      justify-content: center;
    }

    .companion {
      flex-direction: column;
      align-items: stretch;
    }

    .companion-btn {
      width: 100%;
    }
  }
</style>
