<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
  type TimelineFilter = 'all' | 'memory' | 'care' | 'checkin' | 'mission' | 'game' | 'social';
  type DateWindow = 'all' | '7d' | '30d';
  type ChapterHistoryEntry = {
    id: string;
    title: string;
    body: string;
    occurredAt: string;
    tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
  };
  type RelationshipEra = {
    id: string;
    title: string;
    body: string;
    periodLabel: string;
    emphasis: 'care' | 'social' | 'mission' | 'play' | 'quiet' | 'bond';
  };
  type JournalGuidance = {
    title: string;
    body: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    ritualKey: string | null;
    ritualLabel: string | null;
  };

  let statusMessage: string | null = null;
  let statusTone: 'default' | 'success' | 'error' = 'default';
  let rebuilding = false;
  let clearing = false;
  let ritualActing = false;
  let activeFilter: TimelineFilter = 'all';
  let activeWindow: DateWindow = 'all';
  let query = '';

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

  const formatPercent = (value: number | null | undefined) => {
    if (typeof value !== 'number') return null;
    return `${Math.round(value * 100)}%`;
  };

  const formatCount = (value: number | null | undefined, label: string) => {
    const count = typeof value === 'number' ? value : 0;
    return `${count} ${label}${count === 1 ? '' : 's'}`;
  };

  const filterOptions: Array<{ key: TimelineFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'care', label: 'Care' },
    { key: 'mission', label: 'Missions' },
    { key: 'game', label: 'Games' },
    { key: 'social', label: 'Social' },
    { key: 'checkin', label: 'Check-ins' },
    { key: 'memory', label: 'Snapshots' }
  ];

  const windowOptions: Array<{ key: DateWindow; label: string }> = [
    { key: 'all', label: 'All time' },
    { key: '7d', label: 'Last 7d' },
    { key: '30d', label: 'Last 30d' }
  ];

  const setStatus = (message: string, tone: 'default' | 'success' | 'error' = 'default') => {
    statusMessage = message;
    statusTone = tone;
  };

  const withinWindow = (iso: string, window: DateWindow) => {
    if (window === 'all') return true;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return false;
    const days = window === '7d' ? 7 : 30;
    return ts >= Date.now() - days * 24 * 60 * 60 * 1000;
  };

  const shareMoment = async (title: string, body: string) => {
    const text = `${title}\n\n${body}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text });
        setStatus('Moment shared.', 'success');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('Moment copied to clipboard.', 'success');
        return;
      }
      setStatus('Sharing is not available on this device.', 'error');
    } catch {
      setStatus('Could not share this moment right now.', 'error');
    }
  };

  const runGuidedRitual = async (guidance: JournalGuidance | null) => {
    if (!data.selectedCompanionId || !guidance?.ritualKey || ritualActing) return;
    ritualActing = true;
    setStatus(`${guidance.title}…`);
    try {
      const res = await fetch('/api/companions/rituals/act', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companionId: data.selectedCompanionId,
          ritualKey: guidance.ritualKey
        })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(payload?.message ?? 'Could not run that ritual right now.', 'error');
        return;
      }
      await refreshRoute();
      setStatus(
        payload?.reaction?.text
          ? `Ritual complete. ${payload.reaction.text}`
          : 'Ritual complete.',
        'success'
      );
    } catch {
      setStatus('Could not run that ritual right now.', 'error');
    } finally {
      ritualActing = false;
    }
  };

  $: searchableTimeline = activeFilter === 'all' ? data.timeline : data.timeline.filter((item) => item.kind === activeFilter);
  $: windowedTimeline = searchableTimeline.filter((item) => withinWindow(item.occurredAt, activeWindow));
  $: normalizedQuery = query.trim().toLowerCase();
  $: chapterHistory = ((data.chapterHistory ?? []) as ChapterHistoryEntry[]).slice(0, 6);
  $: relationshipEras = ((data.relationshipEras ?? []) as RelationshipEra[]).slice(0, data.subscription?.active ? 6 : 4);
  $: journalGuidance = (data.journalGuidance ?? null) as JournalGuidance | null;
  $: premiumChapterInsight = (data.premiumChapterInsight ?? null) as
    | { title: string; body: string; highlights: string[] }
    | null;
  $: subscriptionActive = Boolean(data.subscription?.active);
  $: premiumSanctuaryStyle = data.premiumSanctuaryStyle ?? null;
  $: archivePreview = data.premiumArchivePreview ?? {
    archivedMoments: 0,
    archivedOpenings: 0,
    timelineLimit: 30,
    chapterHistoryLimit: 6
  };
  $: filteredTimeline =
    normalizedQuery.length === 0
      ? windowedTimeline
      : windowedTimeline.filter((item) =>
          `${item.title} ${item.body} ${item.meta ?? ''}`.toLowerCase().includes(normalizedQuery)
        );

  $: milestoneCards = (() => {
    const cards: Array<{ id: string; label: string; title: string; body: string }> = [];
    for (const milestone of data.chapterMilestones ?? []) {
      cards.push({
        id: milestone.id,
        label: milestone.label,
        title: milestone.title,
        body: milestone.body
      });
      if (cards.length >= 4) return cards.slice(0, 4);
    }
    const revealMoment = data.timeline.find((item) => item.meta === 'Chapter reveal');
    if (revealMoment) {
      cards.push({
        id: revealMoment.id,
        label: 'Chapter reveal',
        title: revealMoment.title,
        body: revealMoment.body
      });
    }
    const digestMoment = data.timeline.find((item) => item.meta === 'Chapter digest');
    if (digestMoment) {
      cards.push({
        id: digestMoment.id,
        label: 'Chapter digest',
        title: digestMoment.title,
        body: digestMoment.body
      });
    }
    const noticedMoment = data.timeline.find((item) => item.meta === 'Noticed by companion');
    if (noticedMoment) {
      cards.push({
        id: noticedMoment.id,
        label: 'Companion insight',
        title: noticedMoment.title,
        body: noticedMoment.body
      });
    }
    if (data.summary?.summary_text) {
      cards.push({
        id: 'summary',
        label: 'Memory snapshot',
        title: `${data.selectedCompanion?.name ?? 'Your companion'} memory pulse`,
        body: data.summary.summary_text
      });
    }
    const missionMoment = data.timeline.find((item) => item.kind === 'mission');
    if (missionMoment) {
      cards.push({
        id: missionMoment.id,
        label: 'Mission milestone',
        title: missionMoment.title,
        body: missionMoment.body
      });
    }
    const careMoment = data.timeline.find((item) => item.kind === 'care');
    if (careMoment) {
      cards.push({
        id: careMoment.id,
        label: 'Care moment',
        title: careMoment.title,
        body: careMoment.body
      });
    }
    const socialMoment = data.timeline.find((item) => item.kind === 'social');
    if (socialMoment) {
      cards.push({
        id: socialMoment.id,
        label: 'Shared moment',
        title: socialMoment.title,
        body: socialMoment.body
      });
    }
    for (const highlight of data.summary?.highlights_json ?? []) {
      if (cards.length >= 4) break;
      cards.push({
        id: `highlight-${highlight}`,
        label: 'Journal highlight',
        title: `${data.selectedCompanion?.name ?? 'Companion'} highlight`,
        body: String(highlight)
      });
    }
    return cards.slice(0, 4);
  })();

  const selectCompanion = async (companionId: string) => {
    const next = new URL($page.url);
    next.searchParams.set('companion', companionId);
    await goto(`${next.pathname}?${next.searchParams.toString()}`, {
      keepFocus: true,
      noScroll: true
    });
  };

  const refreshRoute = async () => {
    const current = new URL($page.url);
    await goto(`${current.pathname}${current.search}`, {
      invalidateAll: true,
      keepFocus: true,
      noScroll: true,
      replaceState: true
    });
  };

  const rebuildSummary = async () => {
    if (!data.selectedCompanionId || rebuilding) return;
    rebuilding = true;
    setStatus('Refreshing memory…');
    try {
      const res = await fetch('/api/companions/memory-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companionId: data.selectedCompanionId })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(payload?.message ?? 'Could not refresh memory right now.', 'error');
        return;
      }
      await refreshRoute();
      setStatus('Memory refreshed.', 'success');
    } catch {
      setStatus('Could not refresh memory right now.', 'error');
    } finally {
      rebuilding = false;
    }
  };

  const clearSummary = async () => {
    if (!data.selectedCompanionId || clearing) return;
    clearing = true;
    setStatus('Clearing memory summary…');
    try {
      const res = await fetch('/api/companions/memory-summary', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companionId: data.selectedCompanionId })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(payload?.message ?? 'Could not clear memory summary.', 'error');
        return;
      }
      await refreshRoute();
      setStatus('Memory summary cleared.', 'success');
    } catch {
      setStatus('Could not clear memory summary.', 'error');
    } finally {
      clearing = false;
    }
  };
</script>

<svelte:head>
  <title>Looma - Memory</title>
</svelte:head>

<div class="memory-root" data-premium-style={premiumSanctuaryStyle ?? 'default'}>
  <SanctuaryPageFrame
    eyebrow="Companion Journal"
    title="Memory"
    subtitle="See what your companion has been carrying forward from recent rituals, play, and mission progress."
  >
    <svelte:fragment slot="actions">
      {#if data.selectedCompanion}
        <EmotionalChip tone="muted">{data.selectedCompanion.name}</EmotionalChip>
      {/if}
    </svelte:fragment>

    <div class="memory-shell">
      <GlassCard class="memory-card memory-card--switcher">
        <div class="card-head">
          <div>
            <p class="eyebrow">Companion</p>
            <h2>Choose whose journal you want to inspect</h2>
          </div>
        </div>

        {#if data.companions.length > 0}
          <div class="companion-list" role="list">
            {#each data.companions as companion}
              <button
                type="button"
                class:selected={companion.id === data.selectedCompanionId}
                class="companion-pill"
                on:click={() => selectCompanion(companion.id)}
              >
                <span class="companion-pill__name">{companion.name}</span>
                <span class="companion-pill__meta">
                  {companion.species ?? 'Muse'} · {companion.mood ?? 'steady'}
                </span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="empty-copy">No companions yet. Start by opening the companion flow first.</p>
        {/if}
      </GlassCard>

      <div class="memory-grid">
        <GlassCard class="memory-card memory-card--summary">
          <div class="card-head">
            <div>
              <p class="eyebrow">Remembered</p>
              <h2>Current memory summary</h2>
            </div>
            <div class="action-row">
              <button type="button" class="btn btn--primary" disabled={rebuilding} on:click={rebuildSummary}>
                {rebuilding ? 'Refreshing…' : 'Refresh memory'}
              </button>
              <button type="button" class="btn btn--ghost" disabled={clearing} on:click={clearSummary}>
                {clearing ? 'Clearing…' : 'Clear summary'}
              </button>
            </div>
          </div>

          {#if statusMessage}
            <p class={`status status--${statusTone}`}>{statusMessage}</p>
          {/if}

          {#if data.summary?.summary_text}
            <p class="summary-text">{data.summary.summary_text}</p>

            {#if data.summary.highlights_json?.length}
              <div class="highlight-list" role="list">
                {#each data.summary.highlights_json as highlight}
                  <span class="highlight-chip">{highlight}</span>
                {/each}
              </div>
            {/if}

            <p class="meta-line">
              Last built {formatWhen(data.summary.last_built_at)}
              {#if data.summary.source_window_json?.windowDays}
                · window {data.summary.source_window_json.windowDays}d
              {/if}
            </p>
          {:else}
            <p class="empty-copy">
              No summary has been built yet for this companion. Refresh memory to create the first journal snapshot.
            </p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">State</p>
              <h2>Emotional context</h2>
            </div>
          </div>

          {#if data.emotionalState}
            <div class="stats-grid">
              <div>
                <span>Mood</span>
                <strong>{data.emotionalState.mood ?? 'steady'}</strong>
              </div>
              <div>
                <span>Trust</span>
                <strong>{formatPercent(data.emotionalState.trust) ?? 'Unknown'}</strong>
              </div>
              <div>
                <span>Bond</span>
                <strong>{formatPercent(data.emotionalState.bond) ?? 'Unknown'}</strong>
              </div>
              <div>
                <span>Tone</span>
                <strong>{data.emotionalState.recentTone ?? 'Unknown'}</strong>
              </div>
            </div>
          {:else}
            <p class="empty-copy">No emotional state snapshot is available yet.</p>
          {/if}
        </GlassCard>
      </div>

      <div class="memory-grid">
        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Why this feels this way</p>
              <h2>{data.relationshipPulse?.headline ?? 'Relationship pulse'}</h2>
            </div>
          </div>

          {#if data.relationshipPulse}
            <p class="meta-line">{data.relationshipPulse.lastCareLabel}</p>
            <ul class="reason-list">
              {#each data.relationshipPulse.reasons as reason}
                <li>{reason}</li>
              {/each}
            </ul>
          {:else}
            <p class="empty-copy">Relationship signals will appear here once this companion has more recent activity.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Daily arc</p>
              <h2>{data.dailyArc?.title ?? 'Guide the bond through the day'}</h2>
            </div>
          </div>

          {#if data.dailyArc}
            <p class="meta-line">{data.dailyArc.progressLabel}</p>
            <p class="summary-text summary-text--compact">{data.dailyArc.body}</p>
            <div class="arc-grid">
              {#each data.dailyArc.steps as step}
                <a class={`arc-card ${step.complete ? 'arc-card--done' : ''}`} href={step.href}>
                  <span class="arc-card__label">{step.label}</span>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </a>
              {/each}
            </div>
          {:else}
            <p class="empty-copy">A daily companion arc will appear here once this companion has more recent activity.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">End of day</p>
              <h2>{data.dailyArcRecap?.title ?? 'Let the day settle'}</h2>
            </div>
          </div>

          {#if data.dailyArcRecap}
            <p class="summary-text summary-text--compact">{data.dailyArcRecap.body}</p>
            <p class="meta-line">Unlocked {formatWhen(data.dailyArcRecap.unlockedAt)}</p>
          {:else}
            <p class="empty-copy">Recap cards unlock once this companion’s daily arc is mostly complete.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Weekly chapter</p>
              <h2>{data.weeklyArc?.title ?? 'See the shape of the week'}</h2>
            </div>
          </div>

          {#if data.weeklyArc}
            <p class="summary-text summary-text--compact">{data.weeklyArc.body}</p>
            <p class="meta-line">{data.weeklyArc.progressLabel}</p>
          {:else}
            <p class="empty-copy">A weekly chapter will appear once this companion has enough recent activity.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Chapter depth</p>
              <h2>{subscriptionActive ? premiumChapterInsight?.title ?? 'Deeper chapter reading' : 'Sanctuary+ insight'}</h2>
            </div>
            {#if subscriptionActive}
              <div class="premium-depth-badges">
                <EmotionalChip tone="warm">Subscriber depth</EmotionalChip>
                {#if premiumSanctuaryStyle}
                  <EmotionalChip tone="cool">{premiumSanctuaryStyle.replace(/_/g, ' ')}</EmotionalChip>
                {/if}
              </div>
            {:else}
              <EmotionalChip tone="muted">Preview</EmotionalChip>
            {/if}
          </div>

          {#if subscriptionActive && premiumChapterInsight}
            <p class="summary-text summary-text--compact">{premiumChapterInsight.body}</p>
            <div class={`chapter-depth-list chapter-depth-list--${premiumSanctuaryStyle ?? 'default'}`}>
              {#each premiumChapterInsight.highlights as highlight}
                <article class="chapter-depth-item">
                  <span></span>
                  <p>{highlight}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="summary-text summary-text--compact">
              Sanctuary+ expands your journal depth with longer timeline access, more chapter openings, and a deeper reading of what is actually shaping the bond week to week.
            </p>
            <div class="action-row">
              <a class="btn btn--primary btn--link" href="/app/wallet">
                Unlock Sanctuary+
              </a>
              <span class="meta-line">
                {#if archivePreview.archivedMoments > 0 || archivePreview.archivedOpenings > 0}
                  {archivePreview.archivedMoments} older moments and {archivePreview.archivedOpenings} extra openings are waiting in the archive.
                {:else}
                  Premium depth will grow as this companion collects more history.
                {/if}
              </span>
            </div>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Shelf interpretation</p>
              <h2>{data.keepsakeInterpretation?.title ?? 'What a keepsake means right now'}</h2>
            </div>
          </div>

          {#if data.keepsakeInterpretation}
            <div class={`keepsake-interpretation keepsake-interpretation--${data.keepsakeInterpretation.tone}`}>
              <span class="milestone-card__label">Featured keepsake</span>
              <strong>{data.keepsakeInterpretation.rewardTitle}</strong>
              <p class="summary-text summary-text--compact">{data.keepsakeInterpretation.body}</p>
            </div>
          {:else}
            <p class="empty-copy">Feature a keepsake on Profile or Companions to let this journal explain what it means in the relationship.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Keepsakes</p>
              <h2>Chapter rewards</h2>
            </div>
          </div>

          {#if data.chapterRewards?.length > 0}
            <div class="milestone-grid">
              {#each data.chapterRewards as reward}
                <article class="milestone-card">
                  <span class="milestone-card__label">Keepsake</span>
                  <h3>{reward.title}</h3>
                  <p>{reward.body}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="empty-copy">Chapter keepsakes unlock as the relationship moves through stronger weekly arcs.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Relationship eras</p>
              <h2>The bond over time</h2>
            </div>
          </div>

          {#if relationshipEras.length > 0}
            <div class="era-grid">
              {#each relationshipEras as era}
                <article class={`era-card era-card--${era.emphasis}`}>
                  <div class="era-card__head">
                    <strong>{era.title}</strong>
                    <span>{era.periodLabel}</span>
                  </div>
                  <p>{era.body}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="empty-copy">Relationship eras will appear once this companion has moved through a few clearer chapters.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Chapter history</p>
              <h2>Past openings</h2>
            </div>
          </div>

          {#if chapterHistory.length > 0}
            <div class="chapter-history">
              {#each chapterHistory as entry}
                <article class="chapter-history__item">
                  <div class="chapter-history__head">
                    <strong>{entry.title}</strong>
                    <span>{formatWhen(entry.occurredAt)}</span>
                  </div>
                  <p>{entry.body}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="empty-copy">Past chapter openings will collect here as new keepsakes are revealed.</p>
          {/if}

          {#if !subscriptionActive && archivePreview.archivedOpenings > 0}
            <p class="meta-line">
              Sanctuary+ reveals {archivePreview.archivedOpenings} older chapter openings beyond this preview.
            </p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Companion guidance</p>
              <h2>{journalGuidance?.title ?? 'A gentle next step'}</h2>
            </div>
          </div>

          {#if journalGuidance}
            <p class="summary-text summary-text--compact">{journalGuidance.body}</p>
            <div class="action-row">
              {#if journalGuidance.ritualKey}
                <button
                  type="button"
                  class="btn btn--primary"
                  disabled={ritualActing}
                  on:click={() => runGuidedRitual(journalGuidance)}
                >
                  {ritualActing ? 'Beginning…' : journalGuidance.ritualLabel ?? journalGuidance.primaryLabel}
                </button>
              {:else}
                <a class="btn btn--primary btn--link" href={journalGuidance.primaryHref}>
                  {journalGuidance.primaryLabel}
                </a>
              {/if}
              <a class="btn btn--ghost btn--link" href={journalGuidance.secondaryHref}>
                {journalGuidance.secondaryLabel}
              </a>
            </div>
          {:else}
            <p class="empty-copy">Guided rituals will appear here once this companion shows a clearer pattern.</p>
          {/if}
        </GlassCard>

        <GlassCard class="memory-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">Weekly pulse</p>
              <h2>This week around {data.selectedCompanion?.name ?? 'your companion'}</h2>
            </div>
          </div>

          {#if data.weeklyPulse}
            <div class="stats-grid stats-grid--pulse">
              <div>
                <span>Care</span>
                <strong>{formatCount(data.weeklyPulse.careMoments, 'moment')}</strong>
              </div>
              <div>
                <span>Missions</span>
                <strong>{formatCount(data.weeklyPulse.missionMoments, 'session')}</strong>
              </div>
              <div>
                <span>Games</span>
                <strong>{formatCount(data.weeklyPulse.gameMoments, 'session')}</strong>
              </div>
              <div>
                <span>Social</span>
                <strong>{formatCount(data.weeklyPulse.socialMoments, 'moment')}</strong>
              </div>
              <div>
                <span>Check-ins</span>
                <strong>{formatCount(data.weeklyPulse.recentCheckins, 'check-in')}</strong>
              </div>
            </div>
            <p class="meta-line">
              Dominant rhythm: {data.weeklyPulse.dominantLabel}
              {#if data.weeklyPulse.summaryWindowDays}
                · memory window {data.weeklyPulse.summaryWindowDays}d
              {/if}
            </p>
          {:else}
            <p class="empty-copy">Weekly activity summaries will appear here once more moments are logged.</p>
          {/if}
        </GlassCard>
      </div>

      <GlassCard class="memory-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Carry a moment with you</p>
            <h2>Shareable journal cards</h2>
          </div>
        </div>

        {#if milestoneCards.length > 0}
          <div class="milestone-grid">
            {#each milestoneCards as card}
              <article class="milestone-card">
                <span class="milestone-card__label">{card.label}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <button type="button" class="filter-chip" on:click={() => shareMoment(card.title, card.body)}>
                  Share moment
                </button>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty-copy">Shareable journal cards will appear once this companion has a few remembered moments.</p>
        {/if}
      </GlassCard>

      <GlassCard class="memory-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Timeline</p>
            <h2>Recent moments</h2>
          </div>
          <div class="filter-row" role="tablist" aria-label="Timeline filters">
            {#each filterOptions as option}
              <button
                type="button"
                class:selected={activeFilter === option.key}
                class="filter-chip"
                on:click={() => {
                  activeFilter = option.key;
                }}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="timeline-toolbar">
          <label class="search-field">
            <span class="search-field__label">Search journal</span>
            <input type="search" bind:value={query} placeholder="Search moments, notes, and summaries" />
          </label>

          <div class="filter-row" role="tablist" aria-label="Date range filters">
            {#each windowOptions as option}
              <button
                type="button"
                class:selected={activeWindow === option.key}
                class="filter-chip"
                on:click={() => {
                  activeWindow = option.key;
                }}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        {#if filteredTimeline.length > 0}
          <ol class="timeline">
            {#each filteredTimeline as item}
              <li class="timeline-item">
                <div class={`timeline-dot timeline-dot--${item.kind}`}></div>
                <div class="timeline-copy">
                  <div class="timeline-head">
                    <h3>{item.title}</h3>
                    <span>{formatWhen(item.occurredAt)}</span>
                  </div>
                  <p>{item.body}</p>
                  {#if item.meta}
                    <p class="timeline-meta">{item.meta}</p>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
          {#if !subscriptionActive && archivePreview.archivedMoments > 0}
            <div class="timeline-upgrade">
              <p>Sanctuary+ unlocks {archivePreview.archivedMoments} older journal moments for this companion.</p>
              <a class="btn btn--ghost btn--link" href="/app/wallet">See premium depth</a>
            </div>
          {/if}
        {:else}
          <p class="empty-copy">
            {activeFilter === 'all'
              ? 'No recent companion moments were found yet.'
              : `No ${activeFilter} moments were found in this journal yet.`}
          </p>
        {/if}
      </GlassCard>
    </div>
  </SanctuaryPageFrame>
</div>

<style>
  .memory-root {
    min-height: 100%;
  }

  .memory-shell {
    display: grid;
    gap: 1rem;
  }

  .memory-grid {
    display: grid;
    gap: 1rem;
  }

  .memory-card {
    display: grid;
    gap: 1rem;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.9rem;
    flex-wrap: wrap;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(148, 163, 184, 0.9);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(1.1rem, 1rem + 0.5vw, 1.5rem);
    color: rgba(241, 245, 249, 0.98);
  }

  .action-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .btn {
    min-height: 2.5rem;
    border-radius: 999px;
    padding: 0 1rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    font-weight: 700;
    cursor: pointer;
  }

  .btn--primary {
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.96), rgba(59, 130, 246, 0.94));
    color: rgba(8, 15, 28, 0.96);
    border-color: transparent;
  }

  .btn--ghost {
    background: rgba(15, 23, 42, 0.46);
    color: rgba(226, 232, 240, 0.92);
  }

  .btn:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  .companion-list {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.1rem;
  }

  .companion-pill {
    min-width: 12rem;
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.42);
    color: rgba(226, 232, 240, 0.94);
    padding: 0.85rem 0.95rem;
    text-align: left;
    display: grid;
    gap: 0.18rem;
    cursor: pointer;
  }

  .companion-pill.selected {
    border-color: rgba(103, 232, 249, 0.5);
    background: rgba(8, 47, 73, 0.54);
    box-shadow: 0 0 0 1px rgba(103, 232, 249, 0.18);
  }

  .companion-pill__name {
    font-weight: 700;
  }

  .companion-pill__meta,
  .meta-line,
  .timeline-meta,
  .empty-copy,
  .status {
    color: rgba(191, 219, 254, 0.8);
  }

  .summary-text {
    font-size: 1rem;
    line-height: 1.55;
    color: rgba(241, 245, 249, 0.96);
  }

  .summary-text--compact {
    font-size: 0.95rem;
  }

  .highlight-list {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .highlight-chip {
    border-radius: 999px;
    background: rgba(8, 47, 73, 0.56);
    border: 1px solid rgba(103, 232, 249, 0.2);
    padding: 0.42rem 0.72rem;
    color: rgba(224, 242, 254, 0.96);
    font-size: 0.84rem;
  }

  .status {
    padding: 0.7rem 0.8rem;
    border-radius: 0.8rem;
    background: rgba(15, 23, 42, 0.5);
  }

  .status--success {
    color: rgba(187, 247, 208, 0.96);
    background: rgba(20, 83, 45, 0.34);
  }

  .status--error {
    color: rgba(254, 205, 211, 0.96);
    background: rgba(127, 29, 29, 0.34);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .stats-grid--pulse strong {
    font-size: 0.95rem;
  }

  .stats-grid div {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem;
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.35);
  }

  .stats-grid span {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.92);
  }

  .stats-grid strong {
    font-size: 1rem;
    color: rgba(241, 245, 249, 0.96);
  }

  .timeline {
    list-style: none;
    display: grid;
    gap: 0.9rem;
    padding: 0;
    margin: 0;
  }

  .timeline-item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.8rem;
    align-items: start;
  }

  .timeline-dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 999px;
    margin-top: 0.45rem;
    background: rgba(148, 163, 184, 0.8);
    box-shadow: 0 0 0 6px rgba(148, 163, 184, 0.12);
  }

  .timeline-dot--memory {
    background: rgba(56, 189, 248, 0.94);
    box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.14);
  }

  .timeline-dot--care {
    background: rgba(45, 212, 191, 0.94);
    box-shadow: 0 0 0 6px rgba(45, 212, 191, 0.14);
  }

  .timeline-dot--checkin {
    background: rgba(251, 191, 36, 0.94);
    box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.14);
  }

  .timeline-dot--mission {
    background: rgba(192, 132, 252, 0.94);
    box-shadow: 0 0 0 6px rgba(192, 132, 252, 0.14);
  }

  .timeline-dot--game {
    background: rgba(244, 114, 182, 0.94);
    box-shadow: 0 0 0 6px rgba(244, 114, 182, 0.14);
  }

  .timeline-dot--social {
    background: rgba(251, 146, 60, 0.94);
    box-shadow: 0 0 0 6px rgba(251, 146, 60, 0.14);
  }

  .timeline-copy {
    display: grid;
    gap: 0.28rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .timeline-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: baseline;
  }

  .timeline-head h3 {
    font-size: 0.98rem;
    color: rgba(241, 245, 249, 0.98);
  }

  .timeline-head span {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.96);
  }

  .timeline-copy p {
    color: rgba(226, 232, 240, 0.9);
    line-height: 1.45;
  }

  .chapter-depth-list {
    display: grid;
    gap: 0.75rem;
  }

  .premium-depth-badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .chapter-depth-list--gilded_dawn .chapter-depth-item {
    border-color: rgba(255, 229, 174, 0.2);
    background: linear-gradient(145deg, rgba(255, 238, 196, 0.08), rgba(15, 23, 42, 0.35));
  }

  .chapter-depth-list--moon_glass .chapter-depth-item {
    border-color: rgba(212, 228, 255, 0.2);
    background: linear-gradient(145deg, rgba(219, 232, 255, 0.06), rgba(15, 23, 42, 0.35));
  }

  .chapter-depth-list--ember_bloom .chapter-depth-item {
    border-color: rgba(255, 196, 164, 0.2);
    background: linear-gradient(145deg, rgba(255, 214, 190, 0.06), rgba(15, 23, 42, 0.35));
  }

  .chapter-depth-list--tide_silk .chapter-depth-item {
    border-color: rgba(190, 236, 232, 0.2);
    background: linear-gradient(145deg, rgba(205, 240, 236, 0.05), rgba(15, 23, 42, 0.35));
  }

  .chapter-depth-item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.7rem;
    align-items: start;
    padding: 0.8rem 0.9rem;
    border-radius: 1rem;
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  .chapter-depth-item span {
    width: 0.55rem;
    height: 0.55rem;
    margin-top: 0.38rem;
    border-radius: 999px;
    background: rgba(214, 190, 141, 0.88);
    box-shadow: 0 0 0 0.35rem rgba(214, 190, 141, 0.1);
  }

  .chapter-depth-item p {
    margin: 0;
    color: rgba(233, 224, 206, 0.84);
    line-height: 1.5;
  }

  .timeline-upgrade {
    margin-top: 0.95rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    align-items: center;
    justify-content: space-between;
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: linear-gradient(135deg, rgba(214, 190, 141, 0.08), rgba(255, 255, 255, 0.02));
    padding: 0.9rem 1rem;
  }

  .timeline-upgrade p {
    margin: 0;
    color: rgba(236, 228, 212, 0.82);
    line-height: 1.45;
  }

  .memory-root[data-premium-style='gilded_dawn'] .timeline-upgrade,
  .memory-root[data-premium-style='gilded_dawn'] .chapter-history__item {
    box-shadow: inset 0 0 0 1px rgba(255, 228, 170, 0.05);
  }

  .memory-root[data-premium-style='moon_glass'] .timeline-upgrade,
  .memory-root[data-premium-style='moon_glass'] .chapter-history__item {
    box-shadow: inset 0 0 0 1px rgba(212, 228, 255, 0.05);
  }

  .memory-root[data-premium-style='ember_bloom'] .timeline-upgrade,
  .memory-root[data-premium-style='ember_bloom'] .chapter-history__item {
    box-shadow: inset 0 0 0 1px rgba(255, 196, 164, 0.05);
  }

  .memory-root[data-premium-style='tide_silk'] .timeline-upgrade,
  .memory-root[data-premium-style='tide_silk'] .chapter-history__item {
    box-shadow: inset 0 0 0 1px rgba(190, 236, 232, 0.05);
  }

  .milestone-grid {
    display: grid;
    gap: 0.75rem;
  }

  .arc-grid {
    display: grid;
    gap: 0.7rem;
  }

  .arc-card {
    display: grid;
    gap: 0.35rem;
    padding: 0.9rem;
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.35);
    color: inherit;
    text-decoration: none;
  }

  .arc-card--done {
    border-color: rgba(74, 222, 128, 0.18);
    background: rgba(20, 83, 45, 0.2);
  }

  .arc-card__label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.82);
  }

  .arc-card strong {
    font-size: 0.98rem;
    color: rgba(241, 245, 249, 0.98);
  }

  .arc-card p {
    color: rgba(226, 232, 240, 0.88);
    line-height: 1.45;
  }

  .milestone-card {
    display: grid;
    gap: 0.55rem;
    padding: 0.95rem;
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background:
      linear-gradient(160deg, rgba(20, 30, 45, 0.58), rgba(16, 19, 28, 0.88)),
      radial-gradient(circle at top left, rgba(103, 232, 249, 0.1), transparent 48%);
  }

  .milestone-card__label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.82);
  }

  .milestone-card h3 {
    font-size: 1rem;
    color: rgba(241, 245, 249, 0.98);
  }

  .milestone-card p {
    color: rgba(226, 232, 240, 0.9);
    line-height: 1.5;
  }

  .chapter-history {
    display: grid;
    gap: 0.75rem;
  }

  .era-grid {
    display: grid;
    gap: 0.75rem;
  }

  .era-card {
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    padding: 0.95rem;
    display: grid;
    gap: 0.32rem;
    background: rgba(15, 23, 42, 0.32);
  }

  .era-card__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .era-card__head strong {
    color: rgba(241, 245, 249, 0.97);
    font-size: 0.95rem;
  }

  .era-card__head span {
    color: rgba(148, 163, 184, 0.82);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .era-card p {
    color: rgba(226, 232, 240, 0.88);
    line-height: 1.5;
  }

  .era-card--care {
    border-color: rgba(132, 214, 179, 0.2);
    background: rgba(21, 41, 36, 0.42);
  }

  .era-card--social {
    border-color: rgba(233, 162, 122, 0.2);
    background: rgba(45, 27, 24, 0.42);
  }

  .era-card--mission {
    border-color: rgba(222, 186, 103, 0.2);
    background: rgba(43, 33, 20, 0.42);
  }

  .era-card--play {
    border-color: rgba(124, 220, 224, 0.2);
    background: rgba(20, 36, 45, 0.42);
  }

  .era-card--quiet {
    border-color: rgba(148, 163, 184, 0.2);
    background: rgba(18, 24, 38, 0.42);
  }

  .era-card--bond {
    border-color: rgba(214, 190, 141, 0.2);
    background: rgba(35, 29, 22, 0.42);
  }

  .chapter-history__item {
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.32);
    padding: 0.9rem;
    display: grid;
    gap: 0.28rem;
  }

  .chapter-history__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .chapter-history__head strong {
    color: rgba(241, 245, 249, 0.97);
    font-size: 0.92rem;
  }

  .chapter-history__head span {
    color: rgba(148, 163, 184, 0.82);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .chapter-history__item p {
    color: rgba(226, 232, 240, 0.88);
    line-height: 1.5;
  }

  .keepsake-interpretation {
    display: grid;
    gap: 0.35rem;
    padding: 0.95rem;
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
  }

  .keepsake-interpretation strong {
    font-size: 0.98rem;
    color: rgba(241, 245, 249, 0.98);
  }

  .keepsake-interpretation--care {
    border-color: rgba(132, 214, 179, 0.24);
    background: rgba(21, 41, 36, 0.48);
  }

  .keepsake-interpretation--social {
    border-color: rgba(233, 162, 122, 0.24);
    background: rgba(45, 27, 24, 0.48);
  }

  .keepsake-interpretation--mission {
    border-color: rgba(222, 186, 103, 0.24);
    background: rgba(43, 33, 20, 0.48);
  }

  .keepsake-interpretation--play {
    border-color: rgba(124, 220, 224, 0.24);
    background: rgba(20, 36, 45, 0.48);
  }

  .keepsake-interpretation--bond {
    border-color: rgba(214, 190, 141, 0.24);
    background: rgba(35, 29, 22, 0.48);
  }

  .reason-list {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding-left: 1.1rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .reason-list li {
    line-height: 1.5;
  }

  .filter-row {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .timeline-toolbar {
    display: grid;
    gap: 0.75rem;
  }

  .search-field {
    display: grid;
    gap: 0.35rem;
  }

  .search-field__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.92);
  }

  .search-field input {
    min-height: 2.9rem;
    border-radius: 0.95rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.38);
    color: rgba(241, 245, 249, 0.96);
    padding: 0 0.95rem;
    font-size: 0.95rem;
  }

  .filter-chip {
    min-height: 2.3rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.42);
    color: rgba(226, 232, 240, 0.92);
    padding: 0 0.8rem;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .filter-chip.selected {
    border-color: rgba(103, 232, 249, 0.45);
    background: rgba(8, 47, 73, 0.56);
    color: rgba(224, 242, 254, 0.98);
  }

  @media (min-width: 960px) {
    .memory-grid {
      grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.8fr);
      align-items: start;
    }

    .timeline-toolbar {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
    }

    .milestone-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
