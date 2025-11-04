<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import StatusCapsule from '$lib/components/home/StatusCapsule.svelte';
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

  const wallet = data?.wallet ?? null;
  const walletBalance = typeof wallet?.balance === 'number' ? wallet.balance : null;
  const walletCurrency = typeof wallet?.currency === 'string' ? wallet.currency : 'shards';
  const walletDelta = Array.isArray(wallet?.recentTx) && wallet.recentTx.length > 0
    ? Number(wallet.recentTx[0]?.amount ?? 0)
    : null;

  let playerSummary: PlayerSummary = data?.playerState
    ? {
        level: data.playerState.level ?? null,
        xp: data.playerState.xp ?? null,
        xpNext: data.playerState.xpNext ?? null,
        energy: data.playerState.energy ?? null,
        energyMax: data.playerState.energyMax ?? null,
        currency: walletBalance,
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

  let rewardList: RewardEntry[] = playerSummary?.rewards ? playerSummary.rewards.slice(0, 5) : [];

  $: rewardList = (playerSummary?.rewards ?? []).slice(0, 5);

  const glowForGame = (slug: string) => {
    if (slug.includes('tile') || slug.includes('run')) return 'glow-cyan';
    if (slug.includes('astro') || slug.includes('match')) return 'glow-magenta';
    return 'glow-violet';
  };
</script>

<svelte:head>
  <title>Looma — Game Hub</title>
</svelte:head>

<div class="games-surface" data-testid="games-hub">
  <BackgroundStack class="games-particles" />
  <main class="games-main">
    <header class="games-hero panel-glass">
      <p class="eyebrow">Arcade Flow</p>
      <h1>Your reflex is the catalyst</h1>
      <p class="lead">
        Experimental Kinforge mini-games tuned for shard flow. Earn rewards, fuel the shop, and feed
        the analytics loop.
      </p>
      <StatusCapsule
        className="w-full max-w-2xl"
        level={playerSummary?.level ?? null}
        xp={playerSummary?.xp ?? null}
        xpNext={playerSummary?.xpNext ?? null}
        energy={playerSummary?.energy ?? null}
        energyMax={playerSummary?.energyMax ?? null}
        notifications={playerSummary?.rewards?.length ?? 0}
        walletBalance={walletBalance}
        walletCurrency={walletCurrency}
        walletDelta={walletDelta}
      />

      <section class="progress-grid" aria-label="Player rewards">
        <article class="progress-card panel-glass glow-cyan">
          <span class="progress-label">Shard balance</span>
          <strong class="progress-value" data-testid="shard-balance">
            {#if typeof walletBalance === 'number'}
              {walletBalance.toLocaleString()}
            {:else}
              —
            {/if}
          </strong>
          <p class="progress-hint">Missions, arcade, and promos flow currency here.</p>
        </article>
        <article class="progress-card panel-glass glow-violet">
          <span class="progress-label">Recent rewards</span>
          {#if rewardList.length > 0}
            <ul class="reward-log" data-testid="reward-log">
              {#each rewardList as reward (reward.id)}
                <li class="reward-row">
                  <span class="reward-delta">
                    +{reward.xpDelta} XP • +{reward.currencyDelta} shards
                    {#if reward.currencyMultiplier && reward.currencyMultiplier > 1}
                      <span class="reward-multiplier">(x{reward.currencyMultiplier.toFixed(1)})</span>
                    {/if}
                  </span>
                  <span class="reward-meta">
                    {reward.gameName ?? reward.game ?? 'Mini-game'}
                    {#if formatRewardTime(reward.insertedAt)}
                      · {formatRewardTime(reward.insertedAt)}
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="progress-hint">Complete a session to see rewards animate here.</p>
          {/if}
        </article>
      </section>
    </header>

    <section class="games-grid" aria-label="Available games" data-testid="games-grid">
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
    max-width: 1200px;
    margin: 0 auto;
    padding: 3.5rem clamp(1rem, 4vw, 2.5rem) 4.5rem;
    display: flex;
    flex-direction: column;
    gap: 2.25rem;
  }

  .games-hero {
    display: grid;
    gap: 1.25rem;
    text-align: left;
  }

  .eyebrow {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: rgba(255, 255, 255, 0.65);
  }

  .games-hero h1 {
    font-size: clamp(2.25rem, 3.5vw, 3rem);
    font-weight: 600;
    margin: 0;
    line-height: 1.1;
  }

  .lead {
    margin: 0;
    max-width: 640px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 1rem;
  }

  .progress-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
    margin-top: 1rem;
  }

  .progress-card {
    position: relative;
    padding: 1.25rem;
    border-radius: 1.3rem;
    background: rgba(6, 9, 26, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: 0 12px 28px rgba(10, 14, 24, 0.35);
  }

  .progress-label {
    font-size: 0.78rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .progress-value {
    font-size: 2rem;
    margin-top: 0.5rem;
    display: block;
  }

  .progress-hint {
    margin: 0.4rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .reward-log {
    margin: 0.75rem 0 0;
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .reward-row {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }

  .reward-delta {
    font-weight: 600;
    color: #fff;
  }

  .reward-multiplier {
    margin-left: 0.35rem;
    color: var(--brand-cyan, #5ef2ff);
  }

  .reward-meta {
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.55);
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
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .game-card,
    .games-main {
      transition: none;
    }
  }
</style>
