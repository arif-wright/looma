<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AchievementsPanel from '$lib/components/games/AchievementsPanel.svelte';
  import LeaderboardTabs from '$lib/components/games/LeaderboardTabs.svelte';
  import LeaderboardList from '$lib/components/games/LeaderboardList.svelte';
  import type { LeaderboardScope, LeaderboardDisplayRow } from '$lib/server/games/leaderboard';

  // This static route takes precedence over the playable [slug] route. No game
  // wrapper, engine, bridge or session SDK is mounted by this archive.
  let scope: LeaderboardScope = 'alltime';
  let rows: LeaderboardDisplayRow[] = [];
  let page = 1;
  let total = 0;
  let loading = true;
  let error = false;
  let achievementsOpen = false;
  let achievementsButton: HTMLButtonElement | null = null;
  const closeAchievements = async () => {
    achievementsOpen = false;
    await tick();
    if (achievementsButton?.isConnected) achievementsButton.focus();
  };
  let controller: AbortController | null = null;
  const limit = 25;

  const loadLeaderboard = async (nextScope: LeaderboardScope, nextPage = 1) => {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    scope = nextScope;
    loading = true;
    error = false;
    if (nextPage === 1) { rows = []; total = 0; page = 1; }
    try {
      const response = await fetch(`/api/leaderboard/tiles-run/${nextScope}?page=${nextPage}&limit=${limit}`, {
        signal: request.signal
      });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const payload = await response.json();
      if (request.signal.aborted) return;
      rows = nextPage === 1 ? payload.rows : [...rows, ...payload.rows];
      page = payload.meta.page;
      total = payload.meta.total;
    } catch {
      if (!request.signal.aborted) error = true;
    } finally {
      if (!request.signal.aborted) loading = false;
    }
  };

  onMount(() => {
    void loadLeaderboard('alltime');
    return () => controller?.abort();
  });
</script>

<svelte:head>
  <title>Memvoya — Tiles Run archive</title>
  <meta name="description" content="Tiles Run history, leaderboards and earned achievements. Find your next run in Neon Run." />
</svelte:head>

<main class="archive" data-testid="tiles-archive">
  <a class="back" href="/app/games">← Back to Play</a>
  <header>
    <p class="eyebrow">Game archive</p>
    <h1>Tiles Run is archived</h1>
    <p>Thanks for playing. Tiles Run is no longer in the play library. Your past scores, rewards and earned achievements stay with Tiles Run.</p>
    <p>For your next run, try Neon Run. It has its own scores and achievements.</p>
    <div class="actions">
      <a class="primary" href="/app/games/runner">Play Neon Run</a>
      <a href="/app/games#reward-history">View reward history</a>
      <button type="button" bind:this={achievementsButton} data-testid="achievements-open" on:click={() => (achievementsOpen = true)}>View achievements</button>
    </div>
  </header>

  <section aria-labelledby="archive-leaderboards">
    <h2 id="archive-leaderboards">Tiles Run leaderboards</h2>
    <p class="quiet">Saved scores stay here under their original game. Recent daily or weekly boards may be empty.</p>
    <LeaderboardTabs active={scope} on:change={(event) => loadLeaderboard(event.detail)} />
    {#if error}
      <div class="notice" role="status">
        <p>We couldn’t load these scores. Your history hasn’t changed.</p>
        <button type="button" on:click={() => loadLeaderboard(scope, rows.length ? page + 1 : 1)}>Try again</button>
      </div>
    {/if}
    {#if !loading && !error && rows.length === 0}
      <p class="notice">No saved scores for this period.</p>
    {:else if !error || rows.length > 0}
      <LeaderboardList {rows} loading={loading && rows.length === 0} {scope} />
    {/if}
    {#if page * limit < total && !error}
      <button type="button" class="more" data-testid="leaderboard-next" disabled={loading} on:click={() => loadLeaderboard(scope, page + 1)}>
        {loading ? 'Loading…' : 'Next page'}
      </button>
    {/if}
  </section>
</main>

<AchievementsPanel open={achievementsOpen} gameSlug="tiles-run" gameName="Tiles Run" filterSlug="tiles-run" on:close={closeAchievements} />

<style>
  .archive { box-sizing: border-box; min-height: 100dvh; max-width: 960px; margin: 0 auto; padding: calc(2rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) calc(6rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); color: #f4edf9; }
  .back { display: inline-block; margin-bottom: 2rem; color: #d9c8e8; }
  header, section { padding: clamp(1rem, 4vw, 2rem); border: 1px solid #76578b; border-radius: 1.25rem; background: #211a30; }
  section { margin-top: 1.5rem; }
  .eyebrow { text-transform: uppercase; letter-spacing: .18em; font-size: .75rem; color: #d6b7e7; }
  h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); line-height: 1.15; margin: .6rem 0 1rem; }
  h2 { font-size: 1.4rem; margin: 0 0 .75rem; }
  p { line-height: 1.65; margin: .8rem 0; }
  .actions { display: flex; flex-wrap: wrap; gap: .8rem; margin-top: 1.5rem; }
  .actions a, button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; padding: .65rem 1rem; border: 1px solid #a489b4; border-radius: .7rem; background: #33253f; color: #fff2fb; text-decoration: none; font: inherit; cursor: pointer; }
  .actions .primary { background: #dac2eb; color: #24152f; font-weight: 650; }
  a:focus-visible, button:focus-visible { outline: 3px solid #f7d396; outline-offset: 3px; }
  button:disabled { opacity: .6; cursor: default; }
  .quiet, .notice { color: #d0c4db; }
  .notice { padding: 1rem 0; }
  .more { margin-top: 1rem; }
</style>
