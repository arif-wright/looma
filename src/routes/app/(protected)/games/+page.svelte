<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
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
</script>

<svelte:head>
  <title>Looma — Game Hub</title>
</svelte:head>

<div class="bg-neuro min-h-screen" data-testid="game-hub">
  <BackgroundStack />
  <main class="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-24 pt-24">
    <header class="flex flex-col gap-3 text-white/80">
      <p class="text-xs uppercase tracking-[0.3em] text-white/60">Arcade</p>
      <h1 class="text-4xl font-semibold text-white">Mini-games hub</h1>
      <p class="max-w-2xl text-sm text-white/70">
        Discover experimental Looma mini-games. Sessions earn small rewards and help us tune the new
        play loop.
      </p>
      <StatusCapsule
        className="w-full max-w-xl"
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

      <section class="progress-overview" aria-label="Player rewards">
        <div class="progress-tile">
          <span class="progress-label">Shard balance</span>
          <strong class="progress-value" data-testid="shard-balance">
            {#if typeof walletBalance === 'number'}
              {walletBalance.toLocaleString()}
            {:else}
              —
            {/if}
          </strong>
          <p class="progress-hint">Rewards from recent sessions and grants sum here.</p>
        </div>
        <div class="progress-tile">
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
            <p class="progress-hint">Complete a session to see rewards appear here.</p>
          {/if}
        </div>
      </section>
    </header>

    <section class="grid gap-6 md:grid-cols-2" aria-label="Available games">
      {#each games as game (game.slug)}
        <OrbPanel class="space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-white/50">Playtest</p>
              <h2 class="text-2xl font-semibold text-white">{game.name}</h2>
            </div>
            <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              v{game.min_version ?? '1.0.0'}
            </span>
          </div>

          <p class="text-sm text-white/70">
            Navigate the neuro field, chase shards, and post a top score. Sessions are capped at
            {game.max_score ?? 100000} points.
          </p>

          <div class="flex items-center justify-end">
            <a
              class="btn-primary whitespace-nowrap"
              href={`/app/games/${game.slug}`}
              data-testid={`game-card-${game.slug}`}
            >
              Play {game.name}
            </a>
          </div>
        </OrbPanel>
      {/each}
    </section>
  </main>
</div>

<style>
  .progress-overview {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-top: 1rem;
  }

  .progress-tile {
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(13, 18, 41, 0.65);
    padding: 1rem 1.2rem;
    display: grid;
    gap: 0.55rem;
  }

  .progress-label {
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.6);
  }

  .progress-value {
    font-size: 1.85rem;
    font-weight: 600;
    color: rgba(244, 247, 255, 0.93);
  }

  .progress-hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(214, 224, 255, 0.65);
  }

  .reward-log {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.75rem;
  }

  .reward-row {
    display: grid;
    gap: 0.2rem;
  }

  .reward-delta {
    font-weight: 600;
    color: rgba(244, 247, 255, 0.9);
  }

  .reward-delta .reward-multiplier {
    margin-left: 0.35rem;
    color: rgba(144, 241, 226, 0.9);
    font-weight: 600;
    font-size: 0.85rem;
  }

  .reward-meta {
    font-size: 0.78rem;
    color: rgba(182, 198, 255, 0.7);
  }

  .btn-primary {
    border-radius: 999px;
    padding: 0.65rem 1.5rem;
    background: linear-gradient(120deg, rgba(155, 92, 255, 0.85), rgba(77, 244, 255, 0.85));
    color: rgba(10, 14, 32, 0.92);
    font-weight: 600;
    letter-spacing: 0.02em;
    border: none;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 200ms ease;
  }

  .btn-primary:hover,
  .btn-primary:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 18px 34px rgba(77, 244, 255, 0.25);
    outline: none;
  }
</style>
