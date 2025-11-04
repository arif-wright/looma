<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import {
    applyPlayerState,
    getPlayerProgressSnapshot,
    playerProgress,
    type PlayerProgressState,
    type RewardEntry
  } from '$lib/games/state';
  import type { PageData } from './$types';

  export let data: PageData;

  const games = data?.games?.length
    ? data.games
    : [
        { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 },
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

  const glowForGame = (slug: string) => {
    if (slug.includes('tile') || slug.includes('run')) return 'glow-cyan';
    if (slug.includes('astro') || slug.includes('match')) return 'glow-magenta';
    return 'glow-violet';
  };

  const fallbackRecent = games.slice(0, 6).map((game) => ({ slug: game.slug, name: game.name }));
  $: recentGames = recentGamesFromRewards();
  $: recentCatalog = recentGames.length > 0 ? recentGames : fallbackRecent;

  const findFeatured = () => {
    if (recentCatalog.length > 0) {
      const preferred = games.find((game) => game.slug === recentCatalog[0].slug);
      if (preferred) return preferred;
      const fromRecent = recentCatalog[0];
      const fallback = games.find((game) => game.slug === fromRecent.slug);
      return fallback ?? { slug: fromRecent.slug, name: fromRecent.name, min_version: '1.0.0', max_score: null };
    }
    return games[0] ?? null;
  };

  $: featuredGame = findFeatured();

  const supportingGames = games.filter((game) => !featuredGame || game.slug !== featuredGame.slug);

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

<div class="games-surface" data-testid="games-hub">
  <BackgroundStack class="games-particles" />
  <main class="games-main">
    <section class="games-hero" aria-label="Featured games">
      <div class="hero-copy">
        <p class="hero-kicker">Pick up where you left off</p>
        <h1>{featuredGame ? `Jump back into ${featuredGame.name}` : 'Choose your next flow'}</h1>
        <p class="hero-lead">
          Continue your streak, explore new worlds, and keep the shard economy humming. Your recent
          sessions are ready when you are.
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
        <p>Recent XP bursts and shard drops from your sessions.</p>
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
        <p class="rewards-empty">Complete a run to see rewards light up here.</p>
      {/if}
    </section>

    <section class="games-grid" aria-label="All games" data-testid="games-grid">
      {#each games as game (game.slug)}
        <article
          class={`game-card panel-glass ${glowForGame(game.slug)}`}
          data-testid={`game-card-${game.slug}`}
        >
          <div class="game-card__meta">
            <span class="badge">Playtest</span>
            <span class="chip">v{game.min_version ?? '1.0.0'}</span>
          </div>
          <h2>{game.name}</h2>
          <p>
            Navigate the neuro field, chase shards, and post a top score. Sessions max at
            {game.max_score ?? 100000} points.
          </p>
          <div class="game-card__cta">
            <a
              class="brand-cta"
              href={`/app/games/${game.slug}`}
              data-testid={`game-cta-${game.slug}`}
              data-ana="cta:play"
            >
              Play {game.name}
            </a>
          </div>
        </article>
      {/each}
    </section>
  </main>
</div>

<style>
  .games-surface {
    position: relative;
    min-height: 100vh;
    background: radial-gradient(circle at top, rgba(91, 216, 255, 0.12), transparent 50%),
      var(--brand-navy, #050712);
    color: #fff;
    overflow: hidden;
  }

  .games-particles :global(canvas) {
    opacity: 0.4;
  }

  .games-main {
    position: relative;
    z-index: 1;
    max-width: 1360px;
    margin: 0 auto;
    padding: 3.5rem clamp(1rem, 4vw, 3rem) 4.5rem;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .games-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
    gap: 2rem;
    align-items: stretch;
  }

  .hero-copy {
    display: grid;
    gap: 1rem;
  }

  .hero-kicker {
    font-size: 0.75rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }

  .hero-copy h1 {
    margin: 0;
    font-size: clamp(2.4rem, 4vw, 3.2rem);
    font-weight: 600;
    line-height: 1.05;
  }

  .hero-lead {
    margin: 0;
    max-width: 560px;
    color: rgba(255, 255, 255, 0.72);
  }

  .hero-recent {
    display: grid;
    gap: 0.6rem;
  }

  .hero-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(255, 255, 255, 0.55);
  }

  .hero-recent__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .recent-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(248, 250, 255, 0.85);
    text-decoration: none;
    font-size: 0.85rem;
    transition: background 150ms ease, border 150ms ease, transform 150ms ease;
  }

  .recent-chip__avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .recent-chip:hover,
  .recent-chip:focus-visible {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.28);
    transform: translateY(-2px);
    outline: none;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
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
    background: radial-gradient(circle at top, rgba(94, 242, 255, 0.15), transparent 60%),
      rgba(8, 12, 28, 0.85);
    display: grid;
    gap: 1.25rem;
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
    padding: 1.5rem;
    border-radius: 1.4rem;
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
    font-size: clamp(1.35rem, 2vw, 1.75rem);
  }

  .games-rewards header p {
    margin: 0.25rem 0 0;
    flex: 1 1 100%;
    color: rgba(248, 250, 255, 0.65);
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
    color: rgba(248, 250, 255, 0.6);
  }

  .games-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1.5rem;
  }

  .game-card {
    position: relative;
    padding: 1.7rem;
    border-radius: 1.5rem;
    background: rgba(6, 9, 26, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 18px 34px rgba(3, 4, 14, 0.45);
    transition: transform 160ms ease, box-shadow 200ms ease;
  }

  .game-card:hover,
  .game-card:focus-within {
    transform: translateY(-3px);
    box-shadow: 0 22px 44px rgba(3, 4, 14, 0.55);
  }

  .game-card__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.65);
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }

  .badge {
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .chip {
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .game-card h2 {
    margin: 1rem 0 0.4rem;
    font-size: 1.65rem;
  }

  .game-card p {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .game-card__cta {
    margin-top: 1.5rem;
  }

  @media (max-width: 768px) {
    .games-main {
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

  @media (prefers-reduced-motion: reduce) {
    .game-card,
    .games-main {
      transition: none;
    }
  }
</style>
