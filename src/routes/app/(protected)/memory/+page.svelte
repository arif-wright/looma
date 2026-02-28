<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let statusMessage: string | null = null;
  let statusTone: 'default' | 'success' | 'error' = 'default';
  let rebuilding = false;
  let clearing = false;

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

  const setStatus = (message: string, tone: 'default' | 'success' | 'error' = 'default') => {
    statusMessage = message;
    statusTone = tone;
  };

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

<div class="memory-root">
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
                <strong>{data.emotionalState.recent_tone ?? 'Unknown'}</strong>
              </div>
            </div>
          {:else}
            <p class="empty-copy">No emotional state snapshot is available yet.</p>
          {/if}
        </GlassCard>
      </div>

      <GlassCard class="memory-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Timeline</p>
            <h2>Recent moments</h2>
          </div>
        </div>

        {#if data.timeline.length > 0}
          <ol class="timeline">
            {#each data.timeline as item}
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
        {:else}
          <p class="empty-copy">No recent companion moments were found yet.</p>
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

  @media (min-width: 960px) {
    .memory-grid {
      grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.8fr);
      align-items: start;
    }
  }
</style>
