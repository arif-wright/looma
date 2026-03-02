<script lang="ts">
  import { goto } from '$app/navigation';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let startingMissionId: string | null = null;
  let banner: { tone: 'default' | 'error'; text: string } | null = null;

  const formatReward = (xp: number | null | undefined, energy: number | null | undefined) => {
    const parts = [];
    if (typeof xp === 'number' && xp > 0) parts.push(`+${xp} XP`);
    if (typeof energy === 'number' && energy > 0) parts.push(`+${energy} momentum`);
    return parts.join(' · ') || 'No reward listed';
  };

  const formatCost = (energy: number | null | undefined) =>
    typeof energy === 'number' && energy > 0 ? `${energy} momentum` : 'No momentum cost';

  const meetsRequirements = (mission: PageData['availableMissions'][number]) => {
    const level = data.stats?.level ?? 0;
    const energy = data.stats?.energy ?? 0;
    const minLevel = mission.minLevel ?? mission.min_level ?? mission.requirements?.minLevel ?? 0;
    const minEnergy = mission.requirements?.minEnergy ?? 0;
    return level >= minLevel && energy >= minEnergy;
  };

  const requirementCopy = (mission: PageData['availableMissions'][number]) => {
    const minLevel = mission.minLevel ?? mission.min_level ?? mission.requirements?.minLevel ?? null;
    const minEnergy = mission.requirements?.minEnergy ?? null;
    const notes = [];
    if (typeof minLevel === 'number' && minLevel > 0) notes.push(`Level ${minLevel}+`);
    if (typeof minEnergy === 'number' && minEnergy > 0) notes.push(`${minEnergy}+ energy`);
    return notes.join(' · ') || 'Ready now';
  };

  const startMission = async (missionId: string) => {
    if (startingMissionId) return;
    startingMissionId = missionId;
    banner = null;
    try {
      const res = await fetch('/api/missions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        banner = { tone: 'error', text: payload?.message ?? 'Could not start this mission.' };
        return;
      }
      await goto(`/app/missions/${encodeURIComponent(missionId)}`);
    } catch {
      banner = { tone: 'error', text: 'Could not start this mission.' };
    } finally {
      startingMissionId = null;
    }
  };
</script>

<svelte:head>
  <title>Looma - Missions</title>
</svelte:head>

<div class="missions-root">
  <SanctuaryPageFrame
    eyebrow="Mission Threads"
    title="Missions"
    subtitle="Choose a thread to deepen your bond, shape your world, or keep today moving."
  >
    <svelte:fragment slot="actions">
      {#if data.activeCompanion}
        <EmotionalChip tone="warm">{data.activeCompanion.name}</EmotionalChip>
      {/if}
    </svelte:fragment>

    <div class="missions-shell">
      {#if banner}
        <div class={`banner banner--${banner.tone}`}>{banner.text}</div>
      {/if}

      <GlassCard class={`mission-panel mission-panel--chapter mission-panel--${data.missionChapterFrame.tone}`}>
        <div class="panel-head">
          <div>
            <p class="eyebrow">{data.missionChapterFrame.eyebrow}</p>
            <h2>{data.missionChapterFrame.title}</h2>
          </div>
          <div class="chapter-head-chips">
            <EmotionalChip tone="muted">
              {data.missionChapterFrame.preferredTypes[0] ?? 'identity'}
            </EmotionalChip>
            {#if data.missionChapterFrame.premiumStyle}
              <EmotionalChip tone="cool">{data.missionChapterFrame.premiumStyle.replace(/_/g, ' ')}</EmotionalChip>
            {/if}
          </div>
        </div>
        <p class="chapter-copy">{data.missionChapterFrame.body}</p>
        {#if data.missionChapterFrame.styleVoice}
          <p class="chapter-style-voice">{data.missionChapterFrame.styleVoice}</p>
        {/if}
      </GlassCard>

      {#if data.activeMissions.length > 0}
        <GlassCard class="mission-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">In progress</p>
              <h2>Pick up where you left off</h2>
            </div>
          </div>

          <div class="mission-stack">
            {#each data.activeMissions as entry}
              <a class="mission-card mission-card--active" href={`/app/missions/${entry.mission.id}`}>
                <div class="mission-card__head">
                  <div>
                    <h3>{entry.mission.title ?? 'Untitled mission'}</h3>
                    <p>{entry.mission.summary ?? 'A thread is waiting for you.'}</p>
                  </div>
                  <EmotionalChip tone="cool">Active</EmotionalChip>
                </div>
                <div class="mission-card__meta">
                  <span>{entry.mission.type}</span>
                  <span>{formatReward(entry.mission.xp_reward, entry.mission.energy_reward)}</span>
                </div>
              </a>
            {/each}
          </div>
        </GlassCard>
      {/if}

      <GlassCard class="mission-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Available now</p>
            <h2>Choose your next thread</h2>
          </div>
        </div>

        {#if data.availableMissions.length > 0}
          <div class="mission-stack">
            {#each data.availableMissions as mission}
              <article class="mission-card">
                <div class="mission-card__head">
                  <div>
                    <h3>{mission.title ?? 'Untitled mission'}</h3>
                    <p>{mission.summary ?? 'A new companion thread is ready.'}</p>
                  </div>
                  <EmotionalChip tone={mission.type === 'identity' ? 'warm' : mission.type === 'world' ? 'cool' : 'muted'}>
                    {mission.type}
                  </EmotionalChip>
                </div>

                <div class="mission-card__meta">
                  <span>{requirementCopy(mission)}</span>
                  <span>{formatCost(mission.cost?.energy ?? null)}</span>
                  <span>{formatReward(mission.xp_reward, mission.energy_reward)}</span>
                </div>

                <div class="mission-card__actions">
                  <a class="btn btn--ghost" href={`/app/missions/${mission.id}`}>Details</a>
                  <button
                    type="button"
                    class="btn btn--primary"
                    disabled={!meetsRequirements(mission) || startingMissionId === mission.id}
                    on:click={() => startMission(mission.id)}
                  >
                    {startingMissionId === mission.id ? 'Starting…' : 'Start mission'}
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty-copy">No missions are available right now. Check back after your next reset.</p>
        {/if}
      </GlassCard>

      {#if data.recentCompletions.length > 0}
        <GlassCard class="mission-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Completed recently</p>
              <h2>Momentum you already built</h2>
            </div>
          </div>

          <div class="history-list">
            {#each data.recentCompletions as entry}
              <a class="history-row" href={`/app/missions/${entry.mission.id}`}>
                <div>
                  <strong>{entry.mission.title ?? 'Untitled mission'}</strong>
                  <p>{formatReward(entry.mission.xp_reward, entry.mission.energy_reward)}</p>
                </div>
                <EmotionalChip tone="muted">Done</EmotionalChip>
              </a>
            {/each}
          </div>
        </GlassCard>
      {/if}
    </div>
  </SanctuaryPageFrame>
</div>

<style>
  .missions-shell {
    display: grid;
    gap: 0.95rem;
  }

  .mission-panel {
    display: grid;
    gap: 0.9rem;
  }

  .mission-panel--chapter {
    border: 1px solid rgba(236, 216, 193, 0.08);
    background:
      linear-gradient(180deg, rgba(30, 24, 18, 0.78), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.1), transparent 56%);
  }

  .mission-panel--care {
    background:
      linear-gradient(180deg, rgba(18, 35, 31, 0.82), rgba(11, 18, 20, 0.92)),
      radial-gradient(circle at top left, rgba(132, 214, 179, 0.12), transparent 56%);
  }

  .mission-panel--social {
    background:
      linear-gradient(180deg, rgba(42, 26, 25, 0.82), rgba(16, 17, 21, 0.92)),
      radial-gradient(circle at top left, rgba(233, 162, 122, 0.12), transparent 56%);
  }

  .mission-panel--mission {
    background:
      linear-gradient(180deg, rgba(38, 30, 19, 0.82), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(222, 186, 103, 0.12), transparent 56%);
  }

  .mission-panel--play {
    background:
      linear-gradient(180deg, rgba(18, 30, 37, 0.82), rgba(11, 17, 21, 0.92)),
      radial-gradient(circle at top left, rgba(124, 220, 224, 0.12), transparent 56%);
  }

  .mission-panel--bond {
    background:
      linear-gradient(180deg, rgba(34, 28, 24, 0.82), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 56%);
  }

  .chapter-copy {
    color: rgba(232, 222, 210, 0.86);
    line-height: 1.5;
  }

  .chapter-style-voice {
    margin: 0;
    color: rgba(215, 201, 174, 0.8);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .chapter-head-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    justify-content: flex-end;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(220, 203, 184, 0.76);
  }

  h2,
  h3,
  p,
  strong {
    margin: 0;
  }

  h2 {
    font-size: clamp(1.08rem, 1rem + 0.45vw, 1.35rem);
    color: rgba(248, 241, 235, 0.98);
  }

  .mission-stack,
  .history-list {
    display: grid;
    gap: 0.75rem;
  }

  .mission-card,
  .history-row {
    display: grid;
    gap: 0.7rem;
    border-radius: 1rem;
    border: 1px solid rgba(236, 216, 193, 0.1);
    background: rgba(255, 248, 240, 0.04);
    padding: 0.95rem;
    color: inherit;
    text-decoration: none;
  }

  .mission-card--active {
    background:
      linear-gradient(145deg, rgba(112, 221, 194, 0.08), rgba(240, 180, 112, 0.08)),
      rgba(255, 248, 240, 0.05);
  }

  .mission-card__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .mission-card__head h3,
  .history-row strong {
    font-size: 1rem;
    color: rgba(248, 241, 235, 0.98);
  }

  .mission-card__head p,
  .history-row p,
  .empty-copy {
    color: rgba(219, 208, 196, 0.82);
    line-height: 1.45;
  }

  .mission-card__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .mission-card__meta span {
    border-radius: 999px;
    padding: 0.34rem 0.62rem;
    background: rgba(255, 246, 230, 0.05);
    border: 1px solid rgba(236, 216, 193, 0.08);
    font-size: 0.76rem;
    color: rgba(240, 228, 214, 0.86);
  }

  .mission-card__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .btn {
    min-height: 2.8rem;
    border-radius: 0.95rem;
    border: 1px solid rgba(236, 216, 193, 0.1);
    font-weight: 700;
    text-align: center;
    display: inline-grid;
    place-items: center;
    text-decoration: none;
    cursor: pointer;
  }

  .btn--primary {
    background: linear-gradient(135deg, rgba(112, 221, 194, 0.96), rgba(240, 180, 112, 0.92));
    color: rgba(19, 16, 18, 0.96);
    border-color: transparent;
  }

  .btn--ghost {
    background: rgba(255, 246, 230, 0.05);
    color: rgba(248, 241, 235, 0.94);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .history-row {
    grid-template-columns: 1fr auto;
    align-items: center;
  }

  .banner {
    padding: 0.8rem 0.9rem;
    border-radius: 0.95rem;
    background: rgba(255, 246, 230, 0.05);
    color: rgba(248, 241, 235, 0.94);
  }

  .banner--error {
    background: rgba(127, 29, 29, 0.26);
    color: rgba(254, 226, 226, 0.96);
  }

  @media (min-width: 880px) {
    .missions-shell {
      grid-template-columns: minmax(0, 1.2fr) minmax(19rem, 0.8fr);
      align-items: start;
    }

    .missions-shell :global(.mission-panel:nth-child(2)) {
      grid-column: 1;
    }
  }
</style>
