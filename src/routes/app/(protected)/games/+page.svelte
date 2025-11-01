<script lang="ts">
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import StatusCapsule from '$lib/components/home/StatusCapsule.svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const games = data?.games?.length
    ? data.games
    : [
        { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 },
        { slug: 'astro-match', name: 'Astro Match', min_version: '1.0.0', max_score: 75000 }
      ];

  const playerState = data?.playerState ?? null;
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
        level={playerState?.level ?? 1}
        xp={playerState?.xp ?? 0}
        xpNext={playerState?.xpNext ?? null}
        energy={playerState?.energy ?? null}
        energyMax={playerState?.energyMax ?? null}
        notifications={playerState?.rewards?.length ?? 0}
        unreadCount={0}
        userEmail={null}
        onLogout={() => {}}
      />
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
