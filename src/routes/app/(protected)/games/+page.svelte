<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import GameGrid from '$lib/components/games/GameGrid.svelte';
  import SanctuaryShell from '$lib/components/ui/sanctuary/SanctuaryShell.svelte';
  import SanctuaryHeader from '$lib/components/ui/sanctuary/SanctuaryHeader.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import { games as gameCatalog } from '$lib/data/games';
  import {
    applyPlayerState,
    getPlayerProgressSnapshot,
    playerProgress,
    type PlayerProgressState,
    type RewardEntry
  } from '$lib/games/state';
  import type { GameMeta } from '$lib/data/games';
  import type { PageData } from './$types';

  export let data: PageData;

  type GameEntry = {
    slug: string;
    name: string;
    min_version: string | null;
    max_score: number | null;
  };

  const games: GameEntry[] = data?.games?.length
    ? (data.games as GameEntry[])
    : [
        { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 },
        { slug: 'arpg', name: 'Looma ARPG', min_version: '1.0.0', max_score: 150000 },
        { slug: 'astro-match', name: 'Astro Match', min_version: '1.0.0', max_score: 75000 }
      ];

  type PlayerSummary = {
    level: number | null;
    xp: number | null;
    xpNext: number | null;
    energy: number | null;
    energyMax: number | null;
    currency: number | null;
    rewards: RewardEntry[];
  } | null;

  let playerSummary: PlayerSummary = data?.playerState
    ? {
        level: data.playerState.level ?? null,
        xp: data.playerState.xp ?? null,
        xpNext: data.playerState.xpNext ?? null,
        energy: data.playerState.energy ?? null,
        energyMax: data.playerState.energyMax ?? null,
        currency: data.playerState.currency ?? null,
        rewards: Array.isArray(data.playerState.rewards)
          ? (data.playerState.rewards as RewardEntry[])
          : []
      }
    : null;

  const applyProgressSnapshot = (next: PlayerProgressState) => {
    playerSummary = {
      level: next.level,
      xp: next.xp,
      xpNext: next.xpNext,
      energy: next.energy,
      energyMax: next.energyMax,
      currency: next.currency,
      rewards: next.rewards
    };
  };

  if (browser && data?.playerState) {
    applyPlayerState(data.playerState);
  }

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    applyProgressSnapshot(getPlayerProgressSnapshot());
    unsubscribe = playerProgress.subscribe((value) => applyProgressSnapshot(value));
  });

  onDestroy(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  const formatRewardTime = (iso: string | null) => {
    if (!iso || !browser) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  let rewardList: RewardEntry[] = playerSummary?.rewards ? playerSummary.rewards.slice() : [];

  $: rewardList = (playerSummary?.rewards ?? []).slice();
  $: hasPlayedGames = rewardList.length > 0;

  const recentGamesFromRewards = () => {
    const unique = new Map<string, { slug: string; name: string }>();
    for (const reward of rewardList) {
      const slug = typeof reward.game === 'string' ? reward.game : null;
      const name = reward.gameName ?? reward.game ?? null;
      if (!slug && !name) continue;
      const key = slug ?? (name ?? '').toLowerCase().replace(/\s+/g, '-');
      if (key && !unique.has(key)) {
        unique.set(key, {
          slug: slug ?? key,
          name: name ?? key.replace(/-/g, ' ')
        });
      }
    }
    return Array.from(unique.values());
  };

  const fallbackRecent = games.slice(0, 6).map((game: GameEntry) => ({ slug: game.slug, name: game.name }));
  $: recentGames = recentGamesFromRewards();
  $: recentCatalog = recentGames.length > 0 ? recentGames : fallbackRecent;

  const metaBySlug = new Map(gameCatalog.map((entry) => [entry.slug, entry]));
  const gamesWithArtwork: GameMeta[] = games
    .map((game: GameEntry) => metaBySlug.get(game.slug))
    .filter((entry: GameMeta | undefined): entry is GameMeta => Boolean(entry));
  const gridGames: GameMeta[] = gamesWithArtwork.length
    ? [
        ...gamesWithArtwork,
        ...gameCatalog.filter((entry) => !gamesWithArtwork.some((item) => item.slug === entry.slug))
      ]
    : gameCatalog;

  $: featuredMeta = featuredGame ? metaBySlug.get(featuredGame.slug) ?? null : null;
  $: heroBackground = featuredMeta
    ? `linear-gradient(115deg, rgba(5, 6, 15, 0.82) 18%, rgba(7, 10, 24, 0.58) 60%, rgba(8, 12, 24, 0.32) 100%), url('${
        featuredMeta.cover.sources['1280'] ?? featuredMeta.cover.sources['960']
      }')`
    : '';

  const findFeatured = () => {
    if (recentCatalog.length > 0) {
      const firstRecent = recentCatalog[0];
      if (!firstRecent) return games[0] ?? null;
      const preferred = games.find((game: GameEntry) => game.slug === firstRecent.slug);
      if (preferred) return preferred;
      const fallback = games.find((game: GameEntry) => game.slug === firstRecent.slug);
      return fallback ?? { slug: firstRecent.slug, name: firstRecent.name, min_version: '1.0.0', max_score: null };
    }
    return games[0] ?? null;
  };

  $: featuredGame = findFeatured();
  const PAGE_SIZE = 3;
  let rewardPage = 0;

  $: totalRewardPages = Math.ceil(rewardList.length / PAGE_SIZE) || 1;
  $: rewardPage = Math.min(rewardPage, Math.max(totalRewardPages - 1, 0));
  $: pagedRewards = rewardList.slice(rewardPage * PAGE_SIZE, rewardPage * PAGE_SIZE + PAGE_SIZE);

  const nextRewardPage = () => {
    if (rewardPage < totalRewardPages - 1) {
      rewardPage += 1;
    }
  };

  const prevRewardPage = () => {
    if (rewardPage > 0) {
      rewardPage -= 1;
    }
  };
</script>

<svelte:head>
  <title>Looma — Game Hub</title>
</svelte:head>

<div class="games-root bg-neuro" data-testid="games-hub">
  <BackgroundStack class="games-particles" />
  <SanctuaryShell padded={false} class="games-shell-wrap">
    <main class="games-shell">
      <SanctuaryHeader
        eyebrow="Ritual Play"
        title="Games"
        subtitle="Choose a short play ritual that supports energy, focus, and connection."
      >
        <svelte:fragment slot="actions">
          <EmotionalChip tone="muted">{hasPlayedGames ? 'Returning player' : 'First session'}</EmotionalChip>
        </svelte:fragment>
      </SanctuaryHeader>
      <section
        class="games-hero"
        style={heroBackground ? `background-image: ${heroBackground};` : undefined}
        aria-label="Featured games"
      >
      <div class="hero-copy">
        <p class="hero-kicker">{hasPlayedGames ? 'Pick up where you left off' : 'Ready when you are'}</p>
        <h1>
          {hasPlayedGames
            ? (featuredGame ? `Jump back into ${featuredGame.name}` : 'Choose your next flow')
            : 'Start your first game'}
        </h1>
        <p class="hero-lead">
          {hasPlayedGames
            ? 'Continue your streak, explore new worlds, and keep the shard economy humming.'
            : 'No games played yet. Pick any game below to start your first session.'}
        </p>
        {#if featuredGame}
          <div class="hero-actions">
            <a
              class="hero-primary"
              href={`/app/games/${featuredGame.slug}`}
              data-testid="featured-play"
              data-ana="cta:play"
            >
              Play {featuredGame.name}
            </a>
            <a class="hero-secondary" href="/app/shop" data-ana="cta:shop">
              Swap shards for boosters
            </a>
          </div>
          <div class="hero-mini-links">
            <span class="hero-mini-links__label">Quick picks:</span>
            <div class="hero-mini-links__chips">
              <a class="hero-mini-links__chip" href="/app/games/runner">Neon Run</a>
              <a class="hero-mini-links__chip" href="/app/games/dodge">Orbfield</a>
            </div>
          </div>
        {/if}
      </div>

      {#if featuredGame}
        <div class="hero-card panel-glass">
          <div class="hero-card__badge">Spotlight</div>
          <div class="hero-card__body">
            <h2>{featuredGame.name}</h2>
            <p>Master the course, bank shards, and climb the community leaderboard.</p>
          </div>
          <footer class="hero-card__footer">
            <div>
              <span class="hero-card__meta-label">Version</span>
              <span class="hero-card__meta-value">v{featuredGame.min_version ?? '1.0.0'}</span>
            </div>
            <div>
              <span class="hero-card__meta-label">Score cap</span>
              <span class="hero-card__meta-value">{featuredGame.max_score?.toLocaleString() ?? '—'}</span>
            </div>
          </footer>
        </div>
      {/if}
      </section>

      <section class="games-rewards panel-glass" aria-label="Latest rewards">
      <header>
        <h2>Latest rewards</h2>
        <p>{hasPlayedGames ? 'Recent XP bursts and shard drops from your sessions.' : 'After your first session, rewards show up here.'}</p>
        {#if rewardList.length > PAGE_SIZE}
          <div class="rewards-pagination">
            <button
              type="button"
              class="pager-btn"
              on:click={prevRewardPage}
              disabled={rewardPage === 0}
              aria-label="Previous rewards page"
              data-testid="reward-page-prev"
            >
              ‹
            </button>
            <span class="pager-status" aria-live="polite">
              Page {rewardPage + 1} of {totalRewardPages}
            </span>
            <button
              type="button"
              class="pager-btn"
              on:click={nextRewardPage}
              disabled={rewardPage >= totalRewardPages - 1}
              aria-label="Next rewards page"
              data-testid="reward-page-next"
            >
              ›
            </button>
          </div>
        {/if}
      </header>
      {#if pagedRewards.length > 0}
        <ul class="rewards-list" data-testid="reward-log">
          {#each pagedRewards as reward (reward.id)}
            <li class="rewards-row">
              <div class="rewards-game">
                <span class="rewards-avatar" aria-hidden="true">
                  {(reward.gameName ?? reward.game ?? 'G').charAt(0)}
                </span>
                <div>
                  <strong>{reward.gameName ?? reward.game ?? 'Mini-game'}</strong>
                  <span>{formatRewardTime(reward.insertedAt) || 'just now'}</span>
                </div>
              </div>
              <div class="rewards-values">
                <span class="xp">+{reward.xpDelta} XP</span>
                <span class="shards">+{reward.currencyDelta} shards</span>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="rewards-empty">No games played yet. Your latest rewards will appear here.</p>
      {/if}
      </section>

      <section class="games-grid-panel panel-glass" aria-label="All games" data-testid="games-grid">
      <header class="games-grid-panel__header">
        <p class="games-grid-panel__kicker">Game library</p>
        <h2 class="games-grid-panel__title">All games</h2>
        <p class="games-grid-panel__lead">Browse the latest sims ready for playtesting.</p>
      </header>
      <GameGrid items={gridGames} aspect="16:9" />
      </section>
    </main>
  </SanctuaryShell>
</div>

<style>
  .games-root {
    position: relative;
    min-height: 100vh;
    color: #fff;
    overflow: hidden;
  }

  :global(.games-shell-wrap) {
    position: relative;
    z-index: 1;
  }

  .games-shell {
    position: relative;
    max-width: 1560px;
    box-sizing: border-box;
    margin: 0 auto;
    --games-pad-top: clamp(1.5rem, 3vw, 2.4rem);
    --games-pad-x: clamp(1.5rem, 3.5vw, 2.75rem);
    --games-pad-bottom: 5.5rem;
    --games-pad-right-extra: 3.25rem;
    padding: var(--games-pad-top) calc(var(--games-pad-x) + var(--games-pad-right-extra)) var(--games-pad-bottom)
      var(--games-pad-x);
    display: flex;
    flex-direction: column;
    gap: 2.75rem;
    width: 100%;
    min-height: 100vh;
  }

  @media (max-width: 980px) {
    .games-shell {
      --games-pad-right-extra: 0px;
    }
  }

  .games-hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
    gap: 2rem;
    align-items: stretch;
    overflow: hidden;
    background-color: rgba(6, 8, 20, 0.92);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    padding: clamp(2.8rem, 5.5vw, 3.9rem) clamp(2.2rem, 4.4vw, 3.2rem);
    border-radius: 1.75rem;
    box-shadow: 0 32px 60px rgba(6, 9, 22, 0.48);
  }

  .games-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, rgba(5, 6, 15, 0.78) 0%, rgba(7, 10, 24, 0.58) 52%, rgba(8, 12, 24, 0.48) 100%);
    z-index: 0;
    pointer-events: none;
  }

  .games-hero::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at top, rgba(94, 242, 255, 0.16), transparent 65%);
    z-index: 0;
    pointer-events: none;
  }

  .games-hero > * {
    position: relative;
    z-index: 1;
  }

  .hero-copy {
    display: grid;
    gap: 1rem;
  }

  .hero-kicker {
    font-size: 0.75rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.68);
    margin: 0;
    text-shadow: 0 6px 18px rgba(4, 6, 16, 0.6);
  }

  .hero-copy h1 {
    margin: 0;
    font-size: clamp(2.4rem, 4vw, 3.2rem);
    font-weight: 600;
    line-height: 1.05;
    text-shadow: 0 12px 32px rgba(4, 6, 16, 0.55);
  }

  .hero-lead {
    margin: 0;
    max-width: 560px;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 0 10px 24px rgba(4, 6, 16, 0.45);
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .hero-mini-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
    margin-top: 0.75rem;
  }

  .hero-mini-links__label {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .hero-mini-links__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .hero-mini-links__chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(15, 23, 42, 0.45);
    color: rgba(248, 250, 255, 0.86);
    font-size: 0.78rem;
    text-decoration: none;
  }

  .hero-mini-links__chip:hover,
  .hero-mini-links__chip:focus-visible {
    border-color: rgba(94, 234, 212, 0.8);
    color: rgba(255, 255, 255, 0.98);
    outline: none;
  }

  .hero-primary,
  .hero-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 999px;
    padding: 0.75rem 1.6rem;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
  }

  .hero-primary {
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    color: rgba(8, 10, 22, 0.92);
    box-shadow: 0 18px 36px rgba(94, 242, 255, 0.35);
  }

  .hero-secondary {
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(248, 250, 255, 0.85);
    background: rgba(255, 255, 255, 0.05);
  }

  .hero-secondary:hover,
  .hero-secondary:focus-visible {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.3);
    outline: none;
  }

  .hero-card {
    position: relative;
    padding: 1.6rem;
    border-radius: 1.5rem;
    background: rgba(8, 12, 28, 0.88);
    display: grid;
    gap: 1.15rem;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 22px 48px rgba(6, 9, 22, 0.38);
  }

  .hero-card__badge {
    align-self: start;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.75);
  }

  .hero-card__body h2 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
  }

  .hero-card__body p {
    margin: 0.35rem 0 0;
    color: rgba(248, 250, 255, 0.7);
  }

  .hero-card__footer {
    display: flex;
    gap: 1.5rem;
    font-size: 0.78rem;
    color: rgba(248, 250, 255, 0.7);
  }

  .hero-card__meta-label {
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.65rem;
    color: rgba(248, 250, 255, 0.55);
  }

  .hero-card__meta-value {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .games-rewards {
    display: grid;
    gap: 1.25rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.3rem);
    border-radius: 1.75rem;
  }

  .games-rewards header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .games-rewards header h2 {
    margin: 0;
    font-size: clamp(1.45rem, 2.1vw, 1.85rem);
    color: rgba(248, 250, 252, 0.96);
  }

  .games-rewards header p {
    margin: 0.25rem 0 0;
    flex: 1 1 100%;
    color: rgba(226, 232, 240, 0.72);
  }

  .rewards-pagination {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
  }

  .pager-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: transparent;
    color: rgba(248, 250, 255, 0.85);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border 150ms ease;
  }

  .pager-btn:hover:not(:disabled),
  .pager-btn:focus-visible:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.24);
    outline: none;
  }

  .pager-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .pager-status {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.65);
  }

  .rewards-list {
    list-style: none;
    display: grid;
    gap: 1rem;
    margin: 0;
    padding: 0;
  }

  .rewards-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .rewards-game {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
  }

  .rewards-avatar {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.35), rgba(155, 92, 255, 0.35));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .rewards-game div {
    display: grid;
    gap: 0.15rem;
  }

  .rewards-game div span {
    font-size: 0.8rem;
    color: rgba(248, 250, 255, 0.55);
  }

  .rewards-values {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
  }

  .rewards-values .xp {
    color: rgba(132, 225, 145, 0.85);
    font-weight: 600;
  }

  .rewards-values .shards {
    color: rgba(94, 242, 255, 0.85);
    font-weight: 600;
  }

  .rewards-empty {
    margin: 0;
    color: rgba(226, 232, 240, 0.7);
  }

  .games-grid-panel {
    display: grid;
    gap: 1.5rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.3rem);
    border-radius: 1.75rem;
  }

  .games-grid-panel__header {
    display: grid;
    gap: 0.45rem;
  }

  .games-grid-panel__kicker {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.62);
  }

  .games-grid-panel__title {
    margin: 0;
    font-size: clamp(1.55rem, 2.3vw, 1.9rem);
    font-weight: 600;
    color: rgba(248, 250, 252, 0.98);
  }

  .games-grid-panel__lead {
    margin: 0;
    max-width: 640px;
    color: rgba(226, 232, 240, 0.78);
  }

  @media (max-width: 768px) {
    .games-shell {
      padding-bottom: 6rem;
      gap: 2rem;
    }

    .games-hero {
      grid-template-columns: 1fr;
    }

    .hero-card__footer {
      flex-direction: column;
      gap: 0.75rem;
    }

  }

  @media (max-width: 1200px) {
    .games-hero {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .games-shell {
      transition: none;
    }
  }
</style>
