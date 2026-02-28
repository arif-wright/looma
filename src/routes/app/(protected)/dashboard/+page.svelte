<script lang="ts">
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const formatWhen = (iso: string | null | undefined) => {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(ts));
  };

  const activeCompanion = data.activeCompanion ?? null;
  const needsCheckin = !data.latestCheckinToday;
  const primaryHref = data.activeMission?.missionId
    ? `/app/missions/${data.activeMission.missionId}`
    : activeCompanion?.id
      ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}`
      : '/app/home';
  const primaryLabel = data.activeMission?.missionId
    ? 'Continue active mission'
    : needsCheckin
      ? 'Check in at Sanctuary'
      : 'Open your journal';
  const primaryCopy = data.activeMission?.title
    ? data.activeMission.title
    : needsCheckin
      ? `${activeCompanion?.name ?? 'Your companion'} is waiting to hear from you today.`
      : 'Review what Looma is carrying forward from your recent play and rituals.';

  const quickLinks = [
    { href: '/app/home', label: 'Sanctuary', description: 'Reconnect with your companion.' },
    { href: '/app/memory', label: 'Journal', description: 'See remembered threads.' },
    { href: '/app/missions', label: 'Missions', description: 'Pick your next thread.' },
    { href: '/app/messages', label: 'Messages', description: 'Answer your conversations.' },
    { href: '/app/circles', label: 'Circles', description: 'Stay close to your people.' },
    { href: '/app/games', label: 'Play', description: 'Use play to keep momentum up.' }
  ];
</script>

<svelte:head>
  <title>Looma - Journey</title>
</svelte:head>

<div class="journey-root">
  <SanctuaryPageFrame
    eyebrow="Journey"
    title="Today in Looma"
    subtitle="A mobile-first snapshot of what matters right now: bond, missions, memory, and momentum."
  >
    <svelte:fragment slot="actions">
      {#if activeCompanion}
        <EmotionalChip tone="warm">{activeCompanion.name}</EmotionalChip>
      {/if}
    </svelte:fragment>

    <div class="journey-shell">
      <GlassCard class="journey-card journey-card--hero">
        <div class="hero-copy">
          <p class="eyebrow">What wants your attention</p>
          <h2>{primaryLabel}</h2>
          <p>{primaryCopy}</p>
        </div>
        <a class="journey-primary" href={primaryHref}>{primaryLabel}</a>
      </GlassCard>

      <div class="journey-grid">
        <GlassCard class="journey-card">
          <p class="eyebrow">Companion state</p>
          <h2>{activeCompanion?.name ?? 'No active companion yet'}</h2>
          <p class="support-copy">
            {#if activeCompanion}
              Mood: {activeCompanion.mood ?? 'steady'} · Energy: {activeCompanion.energy ?? 0}
            {:else}
              Start in Sanctuary to choose or wake your companion.
            {/if}
          </p>
          <div class="button-row">
            <a class="btn btn--ghost" href="/app/home">Open Sanctuary</a>
            {#if activeCompanion?.id}
              <a class="btn btn--ghost" href={`/app/memory?companion=${encodeURIComponent(activeCompanion.id)}`}>Open Journal</a>
            {/if}
          </div>
        </GlassCard>

        <GlassCard class="journey-card">
          <p class="eyebrow">Today</p>
          <h2>{data.latestCheckinToday ? 'You checked in today' : 'No check-in yet today'}</h2>
          <p class="support-copy">
            {#if data.latestCheckinToday}
              Last mood: {data.latestCheckinToday.mood} · {formatWhen(data.latestCheckinToday.created_at)}
            {:else}
              A quick reflection keeps the relationship loop alive.
            {/if}
          </p>
        </GlassCard>

        <GlassCard class="journey-card">
          <p class="eyebrow">Mission thread</p>
          <h2>{data.activeMission?.title ?? 'No active mission'}</h2>
          <p class="support-copy">
            {#if data.activeMission}
              Started {formatWhen(data.activeMission.startedAt)} · {data.activeMission.missionType ?? 'action'} mission
            {:else}
              Choose a mission when you want a clearer sense of direction.
            {/if}
          </p>
          <a class="btn btn--ghost" href={data.activeMission?.missionId ? `/app/missions/${data.activeMission.missionId}` : '/app/missions'}>
            {data.activeMission ? 'Continue mission' : 'Browse missions'}
          </a>
        </GlassCard>

        <GlassCard class="journey-card">
          <p class="eyebrow">Recent play</p>
          <h2>{data.recentGame?.name ?? 'No recent game session'}</h2>
          <p class="support-copy">
            {#if data.recentGame}
              Score {data.recentGame.score?.toLocaleString?.() ?? data.recentGame.score ?? 0} · {formatWhen(data.recentGame.completedAt)}
            {:else}
              Play is optional, but it helps keep energy and rhythm moving.
            {/if}
          </p>
          <a class="btn btn--ghost" href="/app/games">Open Play</a>
        </GlassCard>
      </div>

      {#if data.memorySummary?.summary_text}
        <GlassCard class="journey-card">
          <p class="eyebrow">Memory pulse</p>
          <h2>What Looma is remembering</h2>
          <p class="memory-copy">{data.memorySummary.summary_text}</p>
          {#if data.memorySummary.highlights_json?.length}
            <div class="chip-row">
              {#each data.memorySummary.highlights_json as item}
                <span>{item}</span>
              {/each}
            </div>
          {/if}
        </GlassCard>
      {/if}

      <GlassCard class="journey-card">
        <p class="eyebrow">Go somewhere fast</p>
        <h2>Core spaces</h2>
        <div class="quick-grid">
          {#each quickLinks as link}
            <a class="quick-link" href={link.href}>
              <strong>{link.label}</strong>
              <span>{link.description}</span>
            </a>
          {/each}
        </div>
      </GlassCard>
    </div>
  </SanctuaryPageFrame>
</div>

<style>
  .journey-shell {
    display: grid;
    gap: 0.95rem;
  }

  .journey-grid,
  .quick-grid {
    display: grid;
    gap: 0.8rem;
  }

  :global(.journey-card) {
    display: grid;
    gap: 0.8rem;
  }

  :global(.journey-card--hero) {
    background:
      linear-gradient(145deg, rgba(112, 221, 194, 0.08), rgba(240, 180, 112, 0.08)),
      rgba(255, 248, 240, 0.04);
  }

  .eyebrow {
    margin: 0;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(220, 203, 184, 0.76);
  }

  h2,
  p,
  strong,
  span {
    margin: 0;
  }

  h2,
  .quick-link strong {
    color: rgba(248, 241, 235, 0.98);
  }

  .hero-copy,
  .support-copy,
  .memory-copy,
  .quick-link span {
    color: rgba(219, 208, 196, 0.84);
    line-height: 1.48;
  }

  .journey-primary,
  .btn {
    min-height: 2.85rem;
    border-radius: 0.95rem;
    display: inline-grid;
    place-items: center;
    text-decoration: none;
    font-weight: 700;
    text-align: center;
  }

  .journey-primary {
    background: linear-gradient(135deg, rgba(112, 221, 194, 0.96), rgba(240, 180, 112, 0.92));
    color: rgba(19, 16, 18, 0.96);
  }

  .button-row {
    display: grid;
    gap: 0.55rem;
  }

  .btn {
    border: 1px solid rgba(236, 216, 193, 0.1);
    background: rgba(255, 246, 230, 0.05);
    color: rgba(248, 241, 235, 0.94);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip-row span {
    border-radius: 999px;
    padding: 0.35rem 0.65rem;
    background: rgba(255, 246, 230, 0.05);
    border: 1px solid rgba(236, 216, 193, 0.08);
    font-size: 0.76rem;
    color: rgba(240, 228, 214, 0.86);
  }

  .quick-link {
    display: grid;
    gap: 0.22rem;
    padding: 0.9rem;
    border-radius: 1rem;
    border: 1px solid rgba(236, 216, 193, 0.1);
    background: rgba(255, 248, 240, 0.04);
    text-decoration: none;
  }

  @media (min-width: 760px) {
    .journey-grid,
    .quick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .button-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
