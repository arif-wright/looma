<script lang="ts">
  import { page } from '$app/stores';
  import { Bell, Gem, MessageCircle, Plus, Search } from 'lucide-svelte';
  import ActivityFeed from '$lib/components/home/fantasy/ActivityFeed.svelte';
  import CompanionCard from '$lib/components/home/fantasy/CompanionCard.svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import FriendStatusPanel from '$lib/components/home/fantasy/FriendStatusPanel.svelte';
  import GameCard from '$lib/components/home/fantasy/GameCard.svelte';
  import HeroLivingWorld from '$lib/components/home/fantasy/HeroLivingWorld.svelte';
  import RitualPanel from '$lib/components/home/fantasy/RitualPanel.svelte';
  import WorldCard from '$lib/components/home/fantasy/WorldCard.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const fallbackCompanions = [
    { name: 'Lumi', level: 18, bond: 87, mood: 'Happy', accent: 'violet', favorite: true },
    { name: 'Fay', level: 15, bond: 75, mood: 'Steady', accent: 'silver', favorite: false },
    { name: 'Ember', level: 20, bond: 92, mood: 'Fierce', accent: 'ember', favorite: false },
    { name: 'Sylva', level: 16, bond: 68, mood: 'Gentle', accent: 'verdant', favorite: true }
  ];

  const gameCards = [
    { title: 'Arcane Realms', level: 'Lv. 24', progress: 87, stat: '87%', cover: 'arcane' },
    { title: 'Battle Stadium', level: 'Lv. 18', progress: 65, stat: '65%', cover: 'ember' },
    { title: 'Skybound Odyssey', level: 'Lv. 12', progress: 40, stat: '40%', cover: 'sky' },
    { title: 'Mystic Mayhem', level: 'Lv. 9', progress: 20, stat: '20%', cover: 'void' }
  ];

  const worldCards = [
    { name: 'Looma Prime', level: 24, players: '1.2K', reward: 24, tone: 'violet' },
    { name: 'Crystal Shores', level: 18, players: '856', reward: 18, tone: 'shore' },
    { name: 'Voidspire', level: 29, players: '2.1K', reward: 29, tone: 'void' }
  ];

  const normalizedMood = (value: string | null | undefined) => {
    const mood = value?.trim();
    if (!mood) return 'Happy';
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  };

  $: activeCompanion = data.activeCompanion ?? null;
  $: playerName =
    (data as any)?.profile?.display_name ??
    (data as any)?.user?.user_metadata?.name ??
    (data as any)?.user?.email?.split('@')?.[0] ??
    'Alex';
  $: playerLevel = Math.max(1, Math.floor((data.stats as any)?.level ?? activeCompanion?.bondLevel ?? 24));
  $: playerXp = Math.max(0, Math.floor((data.stats as any)?.xp ?? 3200));
  $: playerXpNext = Math.max(playerXp + 1, Math.floor((data.stats as any)?.xp_next ?? 5000));
  $: companionName = activeCompanion?.name ?? 'Lumi';
  $: companionBond = Math.min(
    100,
    Math.max(0, Math.round(((activeCompanion?.affection ?? 84) + (activeCompanion?.trust ?? 90)) / 2))
  );
  $: companionLevel = Math.max(1, Math.floor(activeCompanion?.bondLevel ?? 18));
  $: companionMood = normalizedMood(activeCompanion?.mood);
  $: ritualCompleted = Math.min(3, Math.max(0, data.rituals?.filter((ritual) => ritual.status === 'completed').length ?? 3));
  $: companions =
    data.creatures && data.creatures.length > 0
      ? data.creatures.slice(0, 4).map((creature, index) => ({
          name: creature.name ?? fallbackCompanions[index]?.name ?? 'Companion',
          level: Math.max(1, Math.floor(((creature.affection ?? 40) + (creature.trust ?? 40)) / 10)),
          bond: Math.min(100, Math.max(0, Math.round(((creature.affection ?? 60) + (creature.trust ?? 60)) / 2))),
          mood: normalizedMood(creature.mood_label ?? creature.mood),
          accent: fallbackCompanions[index]?.accent ?? 'violet',
          favorite: Boolean(creature.is_active),
          avatarUrl: creature.avatar_url ?? null
        }))
      : fallbackCompanions;
</script>

<svelte:head>
  <title>Looma | Home</title>
</svelte:head>

<div class="fantasy-home">
  <div class="ambient" aria-hidden="true"></div>
  <FantasySidebar
    playerName={playerName}
    level={playerLevel}
    xp={playerXp}
    xpNext={playerXpNext}
    activePath={$page.url.pathname}
  />

  <main class="home-main" aria-label="Looma companion home">
    <header class="topbar">
      <label class="search" aria-label="Search Looma">
        <Search size={19} />
        <input type="search" placeholder="Search worlds, games, companions, or friends..." />
        <span>⌘K</span>
      </label>
      <div class="top-actions">
        <a class="currency" href="/app/wallet" aria-label="Open wallet">
          <Gem size={18} />
          <span>{(data.wallet?.balance ?? 1240).toLocaleString()}</span>
        </a>
        <a class="icon-action" href="/app/notifications" aria-label="Notifications"><Bell size={19} /></a>
        <a class="icon-action" href="/app/messages" aria-label="Messages"><MessageCircle size={19} /></a>
        <a class="avatar-action" href="/app/profile" aria-label="Profile">
          <span>{playerName.slice(0, 1).toUpperCase()}</span>
        </a>
      </div>
    </header>

    <div class="content-grid">
      <section class="center-stack">
        <HeroLivingWorld
          playerName={playerName}
          companionName={companionName}
          level={companionLevel}
          mood={companionMood}
          bond={companionBond}
          companionAvatarUrl={activeCompanion?.avatar_url ?? null}
        />

        <section class="glass-section companions-section" aria-labelledby="companions-title">
          <div class="section-header">
            <h2 id="companions-title">Your Companions</h2>
            <a href="/app/companions">View All</a>
          </div>
          <div class="companion-grid">
            {#each companions as companion}
              <CompanionCard {...companion} />
            {/each}
            <a class="summon-card" href="/app/companions" aria-label="Summon new companion">
              <span><Plus size={30} /></span>
              <strong>Summon</strong>
              <small>New Companion</small>
            </a>
          </div>
        </section>

        <div class="lower-grid">
          <section class="glass-section" aria-labelledby="games-title">
            <div class="section-header">
              <h2 id="games-title">Continue Playing</h2>
              <a href="/app/games">View All</a>
            </div>
            <div class="card-grid game-grid">
              {#each gameCards as game}
                <GameCard {...game} />
              {/each}
            </div>
          </section>

          <section class="glass-section" aria-labelledby="worlds-title">
            <div class="section-header">
              <h2 id="worlds-title">Explore Worlds</h2>
              <a href="/app/worlds">View All</a>
            </div>
            <div class="card-grid world-grid">
              {#each worldCards as world}
                <WorldCard {...world} />
              {/each}
            </div>
          </section>
        </div>
      </section>

      <aside class="right-stack" aria-label="Daily panels">
        <RitualPanel completed={ritualCompleted} />
        <FriendStatusPanel />
        <ActivityFeed />
      </aside>
    </div>
  </main>
</div>

<style>
  :global(body) {
    background: #050714;
  }

  :global(.app-shell:has(.fantasy-home)) {
    background: #050714;
  }

  .fantasy-home {
    position: relative;
    display: grid;
    min-height: 100vh;
    grid-template-columns: 18rem minmax(0, 1fr);
    overflow: hidden;
    background:
      radial-gradient(circle at 78% 12%, rgba(123, 77, 255, 0.24), transparent 24rem),
      radial-gradient(circle at 45% 42%, rgba(74, 244, 255, 0.08), transparent 24rem),
      linear-gradient(135deg, #080719, #070a19 52%, #050714);
    color: rgba(249, 247, 255, 0.95);
    font-family: var(--font-body, 'Manrope', system-ui, sans-serif);
  }

  .ambient {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      radial-gradient(circle, rgba(255, 255, 255, 0.52) 0 1px, transparent 1.6px),
      radial-gradient(circle, rgba(98, 232, 255, 0.7) 0 1px, transparent 1.5px),
      radial-gradient(circle, rgba(255, 92, 220, 0.62) 0 1px, transparent 1.5px);
    background-position:
      5% 8%,
      68% 10%,
      36% 70%;
    background-size:
      13rem 12rem,
      17rem 15rem,
      19rem 18rem;
    opacity: 0.42;
  }

  .home-main {
    position: relative;
    z-index: 1;
    min-width: 0;
    padding: 1.5rem;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.35rem;
  }

  .search {
    display: flex;
    width: min(34rem, 100%);
    min-height: 3.15rem;
    align-items: center;
    gap: 0.8rem;
    border: 1px solid rgba(170, 151, 255, 0.18);
    border-radius: 1rem;
    background: rgba(8, 10, 27, 0.58);
    padding: 0 1rem;
    color: rgba(231, 229, 246, 0.58);
    backdrop-filter: blur(22px);
  }

  .search input {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    color: white;
    font: inherit;
    outline: 0;
  }

  .search input::placeholder {
    color: rgba(231, 229, 246, 0.48);
  }

  .search span {
    color: rgba(231, 229, 246, 0.58);
    font-size: 0.78rem;
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .currency,
  .icon-action,
  .avatar-action {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(170, 151, 255, 0.18);
    background: rgba(13, 14, 34, 0.62);
    color: white;
    text-decoration: none;
    backdrop-filter: blur(18px);
  }

  .currency {
    gap: 0.5rem;
    border-radius: 0.95rem;
    padding: 0 1rem;
    font-weight: 800;
  }

  .currency :global(svg) {
    color: #b78cff;
    fill: currentColor;
  }

  .icon-action,
  .avatar-action {
    width: 2.75rem;
    border-radius: 50%;
  }

  .avatar-action {
    background:
      radial-gradient(circle at 42% 32%, #ffd36e, transparent 16%),
      linear-gradient(135deg, #a75cff, #ff6fb8);
    font-weight: 900;
  }

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22rem;
    gap: 1.5rem;
    align-items: start;
  }

  .center-stack,
  .right-stack {
    display: grid;
    gap: 1.2rem;
    min-width: 0;
  }

  .glass-section {
    border: 1px solid rgba(166, 145, 255, 0.18);
    border-radius: 1.15rem;
    background: rgba(12, 13, 32, 0.66);
    padding: 1rem;
    backdrop-filter: blur(22px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 22px 60px rgba(3, 5, 18, 0.26);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .section-header h2 {
    margin: 0;
    color: white;
    font-size: 1.02rem;
  }

  .section-header a {
    color: rgba(226, 222, 246, 0.7);
    font-size: 0.78rem;
    text-decoration: none;
  }

  .companion-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .summon-card {
    display: grid;
    min-height: 13.4rem;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    border: 1px solid rgba(166, 145, 255, 0.18);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.035);
    color: white;
    text-align: center;
    text-decoration: none;
  }

  .summon-card span {
    display: grid;
    width: 4rem;
    height: 4rem;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(244, 241, 255, 0.9);
  }

  .summon-card strong {
    margin-top: 0.5rem;
    font-size: 0.92rem;
  }

  .summon-card small {
    color: rgba(224, 220, 244, 0.72);
    font-size: 0.78rem;
  }

  .lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 1rem;
  }

  .card-grid {
    display: grid;
    gap: 0.75rem;
  }

  .game-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .world-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 1380px) {
    .content-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .right-stack {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 1180px) {
    .fantasy-home {
      grid-template-columns: 1fr;
    }

    .home-main {
      padding: 1rem;
    }

    .companion-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .lower-grid,
    .right-stack {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .topbar {
      align-items: stretch;
      flex-direction: column;
    }

    .top-actions {
      justify-content: space-between;
    }

    .companion-grid,
    .game-grid,
    .world-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .companion-grid,
    .game-grid,
    .world-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
