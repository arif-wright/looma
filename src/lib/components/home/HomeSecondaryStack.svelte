<script lang="ts">
  import type { FeedItem } from '$lib/social/types';
  import QuickPostPanel from '$lib/components/home/QuickPostPanel.svelte';

  export let feedPreview: FeedItem | null = null;
  export let signalsHref = '/app/circles';
  export let upcomingLabel = 'No events scheduled this week.';
  export let upcomingHref = '/app/events';
  export let quickMissionTitle: string | null = null;
  export let quickMissionSummary: string | null = null;
  export let quickMissionHref = '/app/games/arpg';

  let expanded = false;

  const formatTime = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
</script>

<section class="secondary card" aria-label="Secondary content">
  <button
    type="button"
    class="secondary__toggle"
    aria-expanded={expanded}
    on:click={() => {
      expanded = !expanded;
    }}
  >
    {expanded ? 'See less' : 'See more'}
  </button>

  {#if expanded}
    <div class="secondary__stack">
      <article class="mini">
        <header>
          <h3>Signals from your circle</h3>
          <a href={signalsHref}>See all</a>
        </header>

        {#if feedPreview}
          <p class="mini__body">{feedPreview.body || feedPreview.text || 'A new update is waiting for you.'}</p>
          <p class="mini__meta">
            {feedPreview.author_name ?? feedPreview.display_name ?? 'Someone'}
            {#if feedPreview.created_at}
              · {formatTime(feedPreview.created_at)}
            {/if}
          </p>
          <a class="mini__action" href={`/p/${feedPreview.id}`}>Reply</a>
        {:else}
          <p class="mini__body">No new circle signals right now.</p>
        {/if}
      </article>

      <article class="mini">
        <header>
          <h3>Upcoming</h3>
          <a href={upcomingHref}>View schedule</a>
        </header>
        <p class="mini__body">{upcomingLabel}</p>
      </article>

      <article class="mini">
        <header>
          <h3>Quick mission</h3>
          <a href={quickMissionHref}>Open</a>
        </header>
        <p class="mini__body">{quickMissionTitle ?? 'Start a short mission to build momentum.'}</p>
        {#if quickMissionSummary}
          <p class="mini__meta">{quickMissionSummary}</p>
        {/if}
      </article>

      <article class="mini">
        <header>
          <h3>Send a kind note</h3>
          <span class="mini__label">Social</span>
        </header>
        <QuickPostPanel placeholder="Send a kind note (280)" />
      </article>
    </div>
  {/if}
</section>

<style>
  .card {
    border-radius: 1.2rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(8, 14, 28, 0.68);
    padding: 0.85rem;
  }

  .secondary__toggle {
    width: 100%;
    min-height: 2.6rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(226, 232, 240, 0.93);
    font-size: 0.87rem;
    font-weight: 600;
  }

  .secondary__stack {
    margin-top: 0.8rem;
    display: grid;
    gap: 0.65rem;
  }

  .mini {
    border-radius: 0.95rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.56);
    padding: 0.8rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  h3 {
    margin: 0;
    font-size: 0.92rem;
    color: rgba(248, 250, 252, 0.96);
  }

  a,
  .mini__label {
    color: rgba(125, 211, 252, 0.95);
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
  }

  .mini__body {
    margin: 0.48rem 0 0;
    color: rgba(226, 232, 240, 0.92);
    font-size: 0.86rem;
    line-height: 1.4;
  }

  .mini__meta {
    margin: 0.35rem 0 0;
    color: rgba(148, 163, 184, 0.92);
    font-size: 0.78rem;
  }

  .mini__action {
    margin-top: 0.5rem;
    display: inline-flex;
  }
</style>
