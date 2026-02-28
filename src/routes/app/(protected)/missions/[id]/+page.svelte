<script lang="ts">
  import { goto } from '$app/navigation';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let pending: 'start' | 'complete' | null = null;
  let banner: { tone: 'default' | 'error' | 'success'; text: string } | null = null;

  const minLevel = data.mission.minLevel ?? data.mission.min_level ?? data.mission.requirements?.minLevel ?? 0;
  const minEnergy = data.mission.requirements?.minEnergy ?? 0;
  const currentLevel = data.stats?.level ?? 0;
  const currentEnergy = data.stats?.energy ?? 0;
  const canStart = currentLevel >= minLevel && currentEnergy >= minEnergy;

  const formatReward = () => {
    const parts = [];
    if (typeof data.mission.xp_reward === 'number' && data.mission.xp_reward > 0) {
      parts.push(`+${data.mission.xp_reward} XP`);
    }
    if (typeof data.mission.energy_reward === 'number' && data.mission.energy_reward > 0) {
      parts.push(`+${data.mission.energy_reward} energy`);
    }
    return parts.join(' · ') || 'No reward listed';
  };

  const requirementRows = [
    minLevel > 0 ? `Level ${minLevel}+` : null,
    minEnergy > 0 ? `${minEnergy}+ energy` : null,
    data.mission.cost?.energy ? `${data.mission.cost.energy} energy to begin` : null
  ].filter((entry): entry is string => Boolean(entry));

  const refresh = async () => {
    await goto(window.location.pathname, {
      invalidateAll: true,
      keepFocus: true,
      noScroll: true,
      replaceState: true
    });
  };

  const startMission = async () => {
    if (pending) return;
    pending = 'start';
    banner = null;
    try {
      const res = await fetch('/api/missions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId: data.mission.id })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        banner = { tone: 'error', text: payload?.message ?? 'Could not start mission.' };
        return;
      }
      await refresh();
      banner = { tone: 'success', text: 'Mission started.' };
    } catch {
      banner = { tone: 'error', text: 'Could not start mission.' };
    } finally {
      pending = null;
    }
  };

  const completeMission = async () => {
    if (pending || !data.activeSession) return;
    pending = 'complete';
    banner = null;
    try {
      const res = await fetch('/api/missions/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: data.activeSession.id })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        banner = { tone: 'error', text: payload?.message ?? 'Could not complete mission.' };
        return;
      }
      await refresh();
      banner = { tone: 'success', text: 'Mission completed.' };
    } catch {
      banner = { tone: 'error', text: 'Could not complete mission.' };
    } finally {
      pending = null;
    }
  };
</script>

<svelte:head>
  <title>{data.mission.title ?? 'Mission'} - Looma</title>
</svelte:head>

<div class="mission-detail-root">
  <SanctuaryPageFrame
    eyebrow="Mission Thread"
    title={data.mission.title ?? 'Mission'}
    subtitle={data.mission.summary ?? 'A companion thread ready for your attention.'}
  >
    <svelte:fragment slot="actions">
      <EmotionalChip tone={data.mission.type === 'identity' ? 'warm' : data.mission.type === 'world' ? 'cool' : 'muted'}>
        {data.mission.type}
      </EmotionalChip>
    </svelte:fragment>

    <div class="detail-shell">
      {#if banner}
        <div class={`banner banner--${banner.tone}`}>{banner.text}</div>
      {/if}

      <GlassCard class="detail-card">
        <div class="hero-meta">
          <div class="meta-group">
            <span>Difficulty</span>
            <strong>{data.mission.difficulty ?? 'Open'}</strong>
          </div>
          <div class="meta-group">
            <span>Rewards</span>
            <strong>{formatReward()}</strong>
          </div>
          <div class="meta-group">
            <span>Status</span>
            <strong>{data.activeSession ? 'Active' : data.completedSession ? 'Completed before' : 'Ready'}</strong>
          </div>
        </div>

        {#if requirementRows.length > 0}
          <div class="requirements">
            {#each requirementRows as row}
              <span>{row}</span>
            {/each}
          </div>
        {/if}

        <div class="actions">
          {#if data.activeSession}
            <button type="button" class="btn btn--primary" disabled={pending === 'complete'} on:click={completeMission}>
              {pending === 'complete' ? 'Completing…' : 'Complete mission'}
            </button>
          {:else}
            <button type="button" class="btn btn--primary" disabled={!canStart || pending === 'start'} on:click={startMission}>
              {pending === 'start' ? 'Starting…' : 'Start mission'}
            </button>
          {/if}
          <a class="btn btn--ghost" href="/app/missions">Back to missions</a>
        </div>
      </GlassCard>

      <div class="detail-grid">
        <GlassCard class="detail-card">
          <p class="eyebrow">What this thread asks</p>
          <h2>Requirements</h2>
          <ul class="bullet-list">
            <li>Current level: {currentLevel}</li>
            <li>Current energy: {currentEnergy}</li>
            <li>{requirementRows.length > 0 ? requirementRows.join(' · ') : 'No requirements beyond showing up.'}</li>
          </ul>
        </GlassCard>

        <GlassCard class="detail-card">
          <p class="eyebrow">Thread memory</p>
          <h2>Session state</h2>
          {#if data.activeSession}
            <p class="support-copy">This mission is active and ready to close when you feel the thread has landed.</p>
          {:else if data.completedSession}
            <p class="support-copy">You completed this thread before. Revisit it if you want to reflect on the arc again.</p>
          {:else}
            <p class="support-copy">This thread has not been started yet.</p>
          {/if}
        </GlassCard>
      </div>
    </div>
  </SanctuaryPageFrame>
</div>

<style>
  .detail-shell {
    display: grid;
    gap: 0.95rem;
  }

  .detail-card {
    display: grid;
    gap: 0.9rem;
  }

  .hero-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .meta-group,
  .requirements span {
    border-radius: 0.95rem;
    border: 1px solid rgba(236, 216, 193, 0.1);
    background: rgba(255, 248, 240, 0.04);
    padding: 0.8rem;
    display: grid;
    gap: 0.2rem;
  }

  .meta-group span,
  .eyebrow {
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(220, 203, 184, 0.76);
    margin: 0;
  }

  .meta-group strong,
  h2,
  p {
    margin: 0;
  }

  .meta-group strong,
  h2 {
    color: rgba(248, 241, 235, 0.98);
  }

  .requirements {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .btn {
    min-height: 2.9rem;
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

  .detail-grid {
    display: grid;
    gap: 0.95rem;
  }

  .support-copy,
  .bullet-list {
    color: rgba(219, 208, 196, 0.82);
    line-height: 1.5;
  }

  .bullet-list {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
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

  .banner--success {
    background: rgba(20, 83, 45, 0.28);
    color: rgba(220, 252, 231, 0.96);
  }

  @media (max-width: 720px) {
    .hero-meta {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 920px) {
    .detail-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
