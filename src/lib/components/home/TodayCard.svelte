<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PlayerStats } from '$lib/server/queries/getPlayerStats';
  import type { BondBonus } from '$lib/companions/bond';
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
  export let bondGenesisEnabled = false;
  export let companionCount: number | null = null;
  export let companionBonus: BondBonus | null = null;

  const dispatch = createEventDispatcher<{
    claim: void;
    startMission: { missionId: string | null; mode: 'resume' | 'quick' | 'retry' };
    checkCreature: { creatureId: string };
  }>();

  let missionForCta: string | null = null;

  $: resolvedEnergy = energy ?? stats?.energy ?? 0;
  $: bonusEnergy = companionBonus?.missionEnergyBonus ?? 0;
  $: resolvedEnergyMax = (energyMax ?? stats?.energy_max ?? 0) + bonusEnergy;
  $: energyPercent =
    resolvedEnergyMax && resolvedEnergyMax > 0
      ? Math.round((resolvedEnergy / resolvedEnergyMax) * 100)
      : null;
  $: xpBoost = Math.round(((companionBonus?.xpMultiplier ?? 1) - 1) * 100);
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
  $: orbIntensity =
    energyPercent !== null ? Math.max(0.28, Math.min(1, energyPercent / 100)) : 0.45;
  $: showBondGenesisInvite = bondGenesisEnabled && (companionCount ?? 0) === 0;

  function handlePrimary() {
    if (ctaState === 'reward') {
      dispatch('claim');
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: { action: 'reward', mission_id: null, completed: true }
      });
      return;
    }

    if (ctaState === 'retry') {
      dispatch('startMission', { missionId: missionForCta, mode: 'retry' });
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: { action: 'retry', mission_id: missionForCta, completed: false }
      });
      return;
    }

    if (ctaState === 'resume') {
      dispatch('startMission', { missionId: missionForCta, mode: 'resume' });
      sendAnalytics('todaycard_cta', {
        surface: 'home',
        payload: { action: 'resume', mission_id: missionForCta, completed: false }
      });
      return;
    }

    dispatch('startMission', { missionId: null, mode: 'quick' });
    sendAnalytics('todaycard_cta', {
      surface: 'home',
      payload: { action: 'quick', mission_id: null, completed: false }
    });
  }

  function handleCreature() {
    if (!creature?.id) return;
    dispatch('checkCreature', { creatureId: creature.id });
  }
</script>

<article class="pulse-card" data-variant={variant ?? 'C'}>
  <header class="pulse-meta" aria-label="Daily readiness">
    <div class="metric energy">
      <span class="metric-label">Energy</span>
      <strong class="metric-value">
        {resolvedEnergyMax > 0 ? `${resolvedEnergy}/${resolvedEnergyMax}` : resolvedEnergy}
      </strong>
      {#if bonusEnergy > 0}
        <p class="metric-sub bonus">+{bonusEnergy} companion cap</p>
      {/if}
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

    <div class="metric streak">
      <span class="metric-label">Streak</span>
      <strong class="metric-value">{resolvedStreak} days</strong>
      <p class="metric-sub">Keep the luminous loop alive.</p>
    </div>

    <button
      type="button"
      class={`primary-cta btn-glass btn-ripple hover-glow ${showPulse ? 'is-pulsing' : ''}`}
      on:click={handlePrimary}
      disabled={ctaDisabled}
      data-cta-state={ctaState}
    >
      <span class="cta-label">{ctaLabel}</span>
    </button>
  </header>

  <section class="mission-callout" aria-label="Mission guidance">
    <div class="callout-head">
      <span class="callout-label">
        {ctaState === 'reward'
          ? rewardLabel
          : ctaState === 'retry'
          ? 'Recenter & retry'
          : ctaState === 'resume'
          ? 'Resume the flow'
          : 'Next mission thread'}
      </span>
      {#if missionDifficulty && ctaState !== 'reward'}
        <span class="badge">{missionDifficulty}</span>
      {/if}
      {#if xpBoost > 0 && ctaState !== 'reward'}
        <span class="bonus-pill">+{xpBoost}% companion XP</span>
      {/if}
    </div>

    {#if missionCandidate?.name && ctaState !== 'reward'}
      <h3>{missionCandidate.name}</h3>
    {:else if ctaState === 'reward'}
      <h3>Daily bond bonus waiting</h3>
    {:else}
      <h3>Quick win is humming for you</h3>
    {/if}

    {#if missionCandidate?.summary && ctaState !== 'reward'}
      <p class="callout-summary">{missionCandidate.summary}</p>
    {:else if ctaState === 'retry'}
      <p class="callout-summary">Shake off {failMissionName} and let momentum return.</p>
    {:else if ctaState === 'reward'}
      <p class="callout-summary">Claim now to amplify your shared resonance.</p>
    {:else}
      <p class="callout-summary">Short burst, fast dopamine — perfect for keeping the streak glowing.</p>
    {/if}
  </section>

  {#if showBondGenesisInvite}
    <section class="bond-genesis" aria-label="Start your first companion bond">
      <div>
        <span class="callout-label">New arc</span>
        <h3>Find your first bond</h3>
        <p class="callout-summary">
          Take a one-minute vibe quiz and spawn a companion tuned to you.
        </p>
      </div>
      <a
        class="bond-genesis__cta btn-ripple hover-glow"
        href="/app/onboarding/companion"
        sveltekit:prefetch
      >
        Begin quiz
      </a>
    </section>
  {/if}

  <section
    class="companion"
    aria-label="Companion pulse"
    style={`--pulse-intensity:${orbIntensity}`}
  >
    <div class="companion-orb" aria-hidden="true">
      <span class="orb-core"></span>
    </div>
    <div class="companion-copy">
      <span class="callout-label">Companion pulse</span>
      <h3>{creature?.name ?? 'Mystery companion'}</h3>
      <p class="callout-summary mood">{companionMood}</p>
    </div>
    <button type="button" class="secondary-cta btn-ripple hover-glow" on:click={handleCreature} disabled={!creature?.id}>
      Visit {creature?.name ?? 'habitat'}
    </button>
  </section>

  <p class="whisper">{secondaryTip}</p>
</article>

<style>
  .pulse-card {
    display: grid;
    gap: clamp(1.6rem, 3vw, 2.2rem);
    color: rgba(244, 247, 255, 0.92);
  }

  .pulse-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: clamp(1rem, 2vw, 1.5rem);
    align-items: center;
  }

  .metric {
    position: relative;
    display: grid;
    gap: 0.5rem;
    padding: 1.1rem 1.25rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01)),
      rgba(10, 14, 32, 0.35);
    box-shadow: 0 16px 35px rgba(10, 14, 32, 0.36);
    backdrop-filter: blur(22px);
  }

  .metric-label {
    font-size: 0.72rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.6);
  }

  .metric-value {
    font-size: 1.65rem;
    font-weight: 600;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
  }

  .metric-sub {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 255, 0.8);
  }

  .metric-sub.bonus {
    color: rgba(94, 234, 212, 0.92);
  }

  .meter {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: var(--looma-accent, linear-gradient(90deg, #9b5cff, #4df4ff));
    transition: width 360ms ease;
    transform-origin: left center;
  }

  .primary-cta {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.95rem 1.9rem;
    border-radius: 1.5rem;
    border: none;
    font-weight: 600;
    font-size: 1rem;
    color: rgba(8, 15, 30, 0.92);
    background: linear-gradient(120deg, rgba(56, 189, 248, 0.95), rgba(168, 85, 247, 0.92));
    cursor: pointer;
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.22);
    transition: all 180ms ease;
    overflow: hidden;
  }

  .primary-cta::after {
    content: '';
    position: absolute;
    inset: -40%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.45), transparent 70%);
    transform: scale(0.2);
    opacity: 0;
    transition: transform 420ms ease, opacity 420ms ease;
  }

  .primary-cta:hover:not(:disabled),
  .primary-cta:focus-visible,
  .primary-cta:focus {
    transform: translateY(-1px);
    box-shadow: 0 18px 36px rgba(56, 189, 248, 0.35);
  }

  .primary-cta:focus-visible,
  .primary-cta:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.55), 0 18px 36px rgba(56, 189, 248, 0.35);
  }

  .primary-cta:active::after {
    transform: scale(1.5);
    opacity: 0.32;
  }

  .primary-cta:disabled {
    opacity: 0.58;
    cursor: default;
    box-shadow: none;
  }

  .primary-cta.is-pulsing {
    animation: ctaPulse 2s ease-in-out infinite;
  }

  .callout-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .callout-label {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.65);
  }

  .mission-callout {
    display: grid;
    gap: 0.65rem;
  }

  .mission-callout h3 {
    margin: 0;
    font-size: clamp(1.35rem, 2.2vw, 1.7rem);
    font-weight: 600;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
  }

  .callout-summary {
    margin: 0;
    font-size: 0.96rem;
    color: rgba(226, 232, 255, 0.82);
  }

  .bond-genesis {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1.1rem;
    padding: 1.2rem 1.4rem;
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(135deg, rgba(80, 17, 123, 0.58), rgba(14, 116, 144, 0.45));
    box-shadow: 0 14px 40px rgba(7, 10, 24, 0.5);
  }

  .bond-genesis h3 {
    margin: 0.15rem 0;
    font-size: 1.3rem;
  }

  .bond-genesis__cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.65rem 1.4rem;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
    text-decoration: none;
    transition: background 160ms ease, transform 160ms ease;
  }

  .bond-genesis__cta:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .bonus-pill {
    border-radius: 999px;
    border: 1px solid rgba(94, 234, 212, 0.4);
    padding: 0.2rem 0.75rem;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(94, 234, 212, 0.95);
    display: inline-flex;
    align-items: center;
  }

  .companion {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.2rem;
    align-items: center;
    padding: 1.15rem 1.35rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: 0 18px 42px rgba(8, 12, 28, 0.36);
    backdrop-filter: blur(18px);
  }

  .companion-orb {
    position: relative;
    width: 46px;
    height: 46px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.88), rgba(155, 92, 255, 0.45));
    box-shadow: 0 0 22px rgba(155, 92, 255, calc(var(--pulse-intensity)));
    display: grid;
    place-items: center;
    animation: orbPulse 6s ease-in-out infinite;
  }

  .companion-copy h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .mood {
    color: rgba(148, 163, 255, 0.8);
  }

  .secondary-cta {
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    padding: 0.65rem 1.15rem;
    background: transparent;
    color: rgba(244, 247, 255, 0.88);
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .secondary-cta:hover:not(:disabled),
  .secondary-cta:focus-visible {
    transform: translateY(-1px);
    border-color: rgba(77, 244, 255, 0.6);
    box-shadow: 0 14px 28px rgba(77, 244, 255, 0.25);
  }

  .secondary-cta:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 14px 28px rgba(77, 244, 255, 0.25);
  }

  .secondary-cta:disabled {
    opacity: 0.6;
    cursor: default;
    box-shadow: none;
  }

  .whisper {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 255, 0.6);
  }

  @keyframes ctaPulse {
    0%,
    100% {
      box-shadow: 0 18px 40px rgba(155, 92, 255, 0.4);
    }
    50% {
      box-shadow: 0 24px 48px rgba(77, 244, 255, 0.42);
    }
  }

  @keyframes orbPulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 22px rgba(155, 92, 255, calc(var(--pulse-intensity)));
    }

    50% {
      transform: scale(1.08);
      box-shadow: 0 0 30px rgba(77, 244, 255, calc(var(--pulse-intensity) * 1.4));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .primary-cta,
    .secondary-cta,
    .metric,
    .companion-orb {
      transition: none;
      animation: none;
    }
  }
</style>
