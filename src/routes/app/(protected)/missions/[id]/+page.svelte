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
      parts.push(`+${data.mission.energy_reward} Spark`);
    }
    return parts.join(' · ') || 'No reward listed';
  };

  const requirementRows = [
    minLevel > 0 ? `Journey ${minLevel}+` : null,
    minEnergy > 0 ? `${minEnergy}+ Spark` : null,
    data.mission.cost?.energy ? `${data.mission.cost.energy} Spark to begin` : null
  ].filter((entry): entry is string => Boolean(entry));

  const threadLabel =
    data.mission.type === 'identity'
      ? 'Identity thread'
      : data.mission.type === 'world'
        ? 'World thread'
        : data.mission.type === 'action'
          ? 'Action thread'
          : 'Companion thread';

  const threadMeaning =
    data.mission.type === 'identity'
      ? 'This thread should help the companion understand you more clearly.'
      : data.mission.type === 'world'
        ? 'This thread should leave a mark on the sanctuary or the shared world around the bond.'
        : data.mission.type === 'action'
          ? 'This thread should turn care into motion without making closeness feel like work.'
          : 'This thread can still become meaningful if you enter it deliberately.';

  const readinessLabel = canStart
    ? data.activeSession
      ? 'Already underway'
      : 'Ready to begin'
    : currentLevel < minLevel
      ? 'Journey needs time'
      : 'Spark needs recovery';

  $: commitmentSignals = [
    {
      label: 'Thread type',
      title: threadLabel,
      body: threadMeaning
    },
    {
      label: 'Companion read',
      title: data.activeCompanion ? `${data.activeCompanion.name} is part of this` : 'No companion selected',
      body: data.missionChapterFrame.body
    },
    {
      label: 'Readiness',
      title: readinessLabel,
      body: canStart
        ? 'You have enough Journey and Spark for this thread.'
        : requirementRows.length > 0
          ? requirementRows.join(' · ')
          : 'This thread is waiting for the right moment.'
    },
    {
      label: 'Memory result',
      title: data.completedSession ? 'Already remembered' : data.activeSession ? 'In progress' : 'Not started yet',
      body: data.completedSession
        ? 'This mission has already become part of your recent relationship history.'
        : data.activeSession
          ? 'Complete it when the action feels landed enough to become a memory.'
          : 'Starting this mission creates a thread that can later appear in the Journal.'
    }
  ];

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
  <title>{data.mission.title ?? 'Mission'} - Memvoya</title>
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

      <GlassCard class={`detail-card detail-card--chapter detail-card--${data.missionChapterFrame.tone}`}>
        <div class="chapter-head">
          <p class="eyebrow">Current chapter</p>
          {#if data.missionChapterFrame.premiumStyle}
            <EmotionalChip tone="cool">{data.missionChapterFrame.premiumStyle.replace(/_/g, ' ')}</EmotionalChip>
          {/if}
        </div>
        <h2>{data.missionChapterFrame.title}</h2>
        <p class="support-copy">{data.missionChapterFrame.body}</p>
        {#if data.missionChapterFrame.styleVoice}
          <p class="chapter-style-voice">{data.missionChapterFrame.styleVoice}</p>
        {/if}
      </GlassCard>

      <GlassCard class="detail-card detail-card--commitment">
        <div class="chapter-head">
          <div>
            <p class="eyebrow">Before you begin</p>
            <h2>Commit to the thread, not just the reward</h2>
          </div>
          <EmotionalChip tone={canStart ? 'cool' : 'muted'}>{readinessLabel}</EmotionalChip>
        </div>

        <div class="commitment-grid">
          {#each commitmentSignals as signal}
            <article class="commitment-card">
              <span>{signal.label}</span>
              <strong>{signal.title}</strong>
              <p>{signal.body}</p>
            </article>
          {/each}
        </div>
      </GlassCard>

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
            <li>Current journey: {currentLevel}</li>
            <li>Current Spark: {currentEnergy}</li>
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

  .detail-card--chapter {
    border: 1px solid rgba(236, 216, 193, 0.08);
    background:
      linear-gradient(180deg, rgba(30, 24, 18, 0.78), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.1), transparent 56%);
  }

  .detail-card--care {
    background:
      linear-gradient(180deg, rgba(18, 35, 31, 0.82), rgba(11, 18, 20, 0.92)),
      radial-gradient(circle at top left, rgba(132, 214, 179, 0.12), transparent 56%);
  }

  .detail-card--social {
    background:
      linear-gradient(180deg, rgba(42, 26, 25, 0.82), rgba(16, 17, 21, 0.92)),
      radial-gradient(circle at top left, rgba(233, 162, 122, 0.12), transparent 56%);
  }

  .detail-card--mission {
    background:
      linear-gradient(180deg, rgba(38, 30, 19, 0.82), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(222, 186, 103, 0.12), transparent 56%);
  }

  .detail-card--play {
    background:
      linear-gradient(180deg, rgba(18, 30, 37, 0.82), rgba(11, 17, 21, 0.92)),
      radial-gradient(circle at top left, rgba(124, 220, 224, 0.12), transparent 56%);
  }

  .detail-card--bond {
    background:
      linear-gradient(180deg, rgba(34, 28, 24, 0.82), rgba(14, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 56%);
  }

  .chapter-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .chapter-style-voice {
    margin: 0;
    color: rgba(215, 201, 174, 0.8);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .detail-card--commitment {
    border-color: rgba(126, 194, 185, 0.14);
    background:
      linear-gradient(180deg, rgba(17, 30, 32, 0.74), rgba(12, 18, 21, 0.92)),
      radial-gradient(circle at top left, rgba(126, 194, 185, 0.12), transparent 56%);
  }

  .commitment-grid {
    display: grid;
    gap: 0.65rem;
  }

  .commitment-card {
    min-height: 7.8rem;
    border-radius: 1rem;
    border: 1px solid rgba(126, 194, 185, 0.14);
    background: rgba(126, 194, 185, 0.07);
    padding: 0.85rem;
    display: grid;
    align-content: start;
    gap: 0.24rem;
  }

  .commitment-card span {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(147, 222, 210, 0.78);
  }

  .commitment-card strong {
    color: rgba(248, 241, 235, 0.98);
    font-size: 0.9rem;
    line-height: 1.28;
  }

  .commitment-card p {
    color: rgba(219, 208, 196, 0.82);
    font-size: 0.82rem;
    line-height: 1.45;
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

    .commitment-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
