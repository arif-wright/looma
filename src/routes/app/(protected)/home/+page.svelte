<script lang="ts">
  import { page } from '$app/stores';
  import { Bell, Gamepad2, Heart, Home, MessageCircle, Plus, Search, Sparkles, UserRound } from 'lucide-svelte';
  import ActivityFeed from '$lib/components/home/fantasy/ActivityFeed.svelte';
  import CompanionCard from '$lib/components/home/fantasy/CompanionCard.svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import FriendStatusPanel from '$lib/components/home/fantasy/FriendStatusPanel.svelte';
  import GameCard from '$lib/components/home/fantasy/GameCard.svelte';
  import HeroLivingWorld from '$lib/components/home/fantasy/HeroLivingWorld.svelte';
  import RitualPanel from '$lib/components/home/fantasy/RitualPanel.svelte';
  import WorldCard from '$lib/components/home/fantasy/WorldCard.svelte';
  import ShardIcon from '$lib/components/ui/ShardIcon.svelte';
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

  const mobileNav = [
    { label: 'Home', href: '/app/home', icon: Home },
    { label: 'Bond', href: '/app/companions', icon: Heart },
    { label: 'Play', href: '/app/games', icon: Gamepad2 },
    { label: 'Messages', href: '/app/messages', icon: MessageCircle },
    { label: 'Profile', href: '/app/profile', icon: UserRound }
  ];

  const backgroundByArchetype: Record<string, string> = {
    echo: '/assets/echo_background.png',
    guardian: '/assets/guardian_background.png',
    muse: '/assets/muse_background.png',
    root: '/assets/root_background.png',
    spark: '/assets/spark_background.png'
  };

  type HeroScenePlacement = {
    backgroundPosition: string;
    mobileBackgroundPosition: string;
    stageLeft: string;
    stageRight: string;
    stageTop: string;
    stageBottom: string;
    stageWidth: string;
    stageHeight: string;
    stageTranslateX: string;
    stageTranslateY: string;
    mobileStageTop: string;
    mobileStageBottom: string;
    mobileStageWidth: string;
    mobileStageHeight: string;
    mobileStageTranslateY: string;
  };

  const defaultHeroScenePlacement: HeroScenePlacement = {
    backgroundPosition: 'center top',
    mobileBackgroundPosition: 'center top',
    stageLeft: '40%',
    stageRight: '18%',
    stageTop: '-0.8rem',
    stageBottom: '0.35rem',
    stageWidth: 'min(33rem, 124%)',
    stageHeight: 'min(33rem, 122%)',
    stageTranslateX: '0',
    stageTranslateY: '0',
    mobileStageTop: '8.5rem',
    mobileStageBottom: '7.4rem',
    mobileStageWidth: 'min(25rem, 112vw)',
    mobileStageHeight: 'min(28rem, 58svh)',
    mobileStageTranslateY: '0'
  };

  // Tuned from the platform/landing spot in each generated background. Keeping
  // these values data-driven lets art changes be calibrated without touching layout CSS.
  const heroScenePlacementByArchetype: Record<string, Partial<HeroScenePlacement>> = {
    echo: {
      backgroundPosition: '51% top',
      mobileBackgroundPosition: '52% top',
      stageLeft: '39%',
      stageRight: '17%',
      stageTranslateY: '0.2rem'
    },
    guardian: {
      backgroundPosition: '50% top',
      mobileBackgroundPosition: '51% top',
      stageLeft: '39%',
      stageRight: '18%',
      stageTranslateY: '0.1rem'
    },
    muse: {
      backgroundPosition: 'center top',
      mobileBackgroundPosition: 'center top',
      stageLeft: '22%',
      stageRight: '39%',
      stageWidth: 'min(23rem, 92%)',
      stageHeight: 'min(24rem, 100%)',
      stageTranslateX: '-0.75rem',
      stageTranslateY: '2.35rem',
      mobileStageWidth: 'min(20rem, 92vw)',
      mobileStageHeight: 'min(22rem, 52svh)',
      mobileStageTranslateY: '1.55rem'
    },
    root: {
      backgroundPosition: '49% top',
      mobileBackgroundPosition: '50% top',
      stageLeft: '38%',
      stageRight: '18%',
      stageTranslateY: '0.35rem'
    },
    spark: {
      backgroundPosition: '52% top',
      mobileBackgroundPosition: '53% top',
      stageLeft: '41%',
      stageRight: '16%',
      stageTranslateY: '-0.05rem'
    }
  };

  const buildHeroSceneStyle = (placement: HeroScenePlacement, backgroundUrl: string) =>
    [
      `--home-bg-image: url('${backgroundUrl}')`,
      `--home-bg-position: ${placement.backgroundPosition}`,
      `--home-bg-position-mobile: ${placement.mobileBackgroundPosition}`,
      `--hero-stage-left: ${placement.stageLeft}`,
      `--hero-stage-right: ${placement.stageRight}`,
      `--hero-stage-top: ${placement.stageTop}`,
      `--hero-stage-bottom: ${placement.stageBottom}`,
      `--hero-stage-width: ${placement.stageWidth}`,
      `--hero-stage-height: ${placement.stageHeight}`,
      `--hero-stage-translate-x: ${placement.stageTranslateX}`,
      `--hero-stage-translate-y: ${placement.stageTranslateY}`,
      `--hero-stage-mobile-top: ${placement.mobileStageTop}`,
      `--hero-stage-mobile-bottom: ${placement.mobileStageBottom}`,
      `--hero-stage-mobile-width: ${placement.mobileStageWidth}`,
      `--hero-stage-mobile-height: ${placement.mobileStageHeight}`,
      `--hero-stage-mobile-translate-y: ${placement.mobileStageTranslateY}`
    ].join('; ');

  const normalizedMood = (value: string | null | undefined) => {
    const mood = value?.trim();
    if (!mood) return 'Happy';
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  };

  const normalizeArchetype = (value: string | null | undefined) =>
    (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

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
  $: companionArchetype = normalizeArchetype(activeCompanion?.species) || 'muse';
  $: heroBackgroundUrl = backgroundByArchetype[companionArchetype] ?? '/assets/muse_background.png';
  $: heroScenePlacement = {
    ...defaultHeroScenePlacement,
    ...(heroScenePlacementByArchetype[companionArchetype] ?? {})
  };
  $: heroSceneStyle = buildHeroSceneStyle(heroScenePlacement, heroBackgroundUrl);
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

<div class="fantasy-home" style={heroSceneStyle}>
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
          <ShardIcon size={20} />
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

        <section class="mobile-loop" aria-label="Today's companion loop">
          <RitualPanel completed={ritualCompleted} />
          <div class="mobile-quick-actions">
            <a href="/app/companions">
              <Sparkles size={19} />
              <span>Gift</span>
            </a>
            <a href="/app/games">
              <Gamepad2 size={19} />
              <span>Play</span>
            </a>
            <a href="/app/messages">
              <Heart size={19} />
              <span>Check in</span>
            </a>
          </div>
        </section>

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

  <nav class="mobile-bottom-nav" aria-label="Primary mobile navigation">
    {#each mobileNav as item}
      <a class:active={$page.url.pathname === item.href || (item.href !== '/app/home' && $page.url.pathname.startsWith(item.href))} href={item.href}>
        <svelte:component this={item.icon} size={21} />
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>
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
    grid-template-columns: 14.5rem minmax(0, 1fr);
    overflow: hidden;
    background:
      radial-gradient(circle at 78% 12%, rgba(123, 77, 255, 0.24), transparent 24rem),
      radial-gradient(circle at 45% 42%, rgba(74, 244, 255, 0.08), transparent 24rem),
      linear-gradient(135deg, #080719, #070a19 52%, #050714);
    color: rgba(249, 247, 255, 0.95);
    font-family: var(--font-body, 'Manrope', system-ui, sans-serif);
  }

  .home-main::before,
  .home-main::after {
    content: '';
    position: absolute;
    top: 0;
    right: calc(19rem + 1.55rem);
    left: 0;
    height: clamp(40rem, 64vw, 48rem);
    pointer-events: none;
  }

  .home-main::before {
    z-index: 0;
    background-image: var(--home-bg-image);
    background-position: var(--home-bg-position, center top);
    background-size: cover;
    opacity: 0.9;
    transform: scale(1.01);
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 58%, rgba(0, 0, 0, 0.78) 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 0%, #000 58%, rgba(0, 0, 0, 0.78) 70%, transparent 100%);
  }

  .home-main::after {
    display: none;
  }

  .home-main {
    position: relative;
    z-index: 2;
    min-width: 0;
    padding: 1.5rem 1.35rem 1.35rem;
  }

  .topbar,
  .content-grid {
    position: relative;
    z-index: 2;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .search {
    display: flex;
    width: min(27.5rem, 100%);
    min-height: 2.9rem;
    align-items: center;
    gap: 0.8rem;
    border: 1px solid rgba(170, 151, 255, 0.18);
    border-radius: 1.45rem;
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
    grid-template-columns: minmax(0, 1fr) 19rem;
    gap: 1.55rem;
    align-items: start;
  }

  .center-stack,
  .right-stack {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .mobile-loop,
  .mobile-bottom-nav {
    display: none;
  }

  .glass-section {
    border: 1px solid rgba(166, 145, 255, 0.18);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 50% 0%, rgba(126, 92, 255, 0.08), transparent 42%),
      rgba(12, 13, 32, 0.66);
    padding: 0.88rem;
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
    margin-bottom: 0.78rem;
  }

  .section-header h2 {
    margin: 0;
    color: white;
    font-size: 0.98rem;
  }

  .section-header a {
    color: rgba(226, 222, 246, 0.7);
    font-size: 0.78rem;
    text-decoration: none;
  }

  .companion-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.86rem;
  }

  .summon-card {
    display: grid;
    min-height: 12.2rem;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    border: 1px solid rgba(166, 145, 255, 0.18);
    border-radius: 0.86rem;
    background: rgba(255, 255, 255, 0.035);
    color: white;
    text-align: center;
    text-decoration: none;
  }

  .summon-card span {
    display: grid;
    width: 3.8rem;
    height: 3.8rem;
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
    gap: 0.65rem;
  }

  .game-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .world-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 1380px) {
    .home-main::before,
    .home-main::after {
      right: 0;
    }

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
    .fantasy-home {
      display: block;
      min-height: 100svh;
      overflow-x: hidden;
      padding-bottom: calc(5.8rem + env(safe-area-inset-bottom));
      background:
        radial-gradient(circle at 50% 18%, rgba(123, 77, 255, 0.32), transparent 18rem),
        radial-gradient(circle at 50% 46%, rgba(74, 244, 255, 0.12), transparent 16rem),
        linear-gradient(180deg, #07081c, #050714 64%);
    }

    .home-main::before {
      background-position: var(--home-bg-position-mobile, var(--home-bg-position, center top));
      height: 45rem;
      opacity: 0.78;
    }

    :global(.fantasy-sidebar) {
      display: none;
    }

    .home-main {
      padding: 0;
    }

    .topbar {
      position: fixed;
      left: 0.85rem;
      right: 0.85rem;
      top: max(0.7rem, env(safe-area-inset-top));
      z-index: 20;
      margin: 0;
      pointer-events: none;
    }

    .search {
      display: none;
    }

    .top-actions {
      width: 100%;
      justify-content: flex-end;
      pointer-events: auto;
    }

    .currency {
      min-height: 2.45rem;
      border-radius: 999px;
      padding: 0 0.8rem;
      font-size: 0.82rem;
    }

    .icon-action {
      display: none;
    }

    .avatar-action {
      width: 2.45rem;
      min-height: 2.45rem;
    }

    .content-grid,
    .center-stack {
      display: block;
    }

    .right-stack {
      display: none;
    }

    .mobile-loop {
      display: grid;
      gap: 0.8rem;
      margin: -1rem 0.85rem 1rem;
      position: relative;
      z-index: 4;
    }

    .mobile-quick-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.65rem;
    }

    .mobile-quick-actions a {
      display: grid;
      min-height: 4.7rem;
      place-items: center;
      align-content: center;
      gap: 0.32rem;
      border: 1px solid rgba(167, 92, 255, 0.22);
      border-radius: 1rem;
      background: rgba(16, 16, 41, 0.74);
      color: white;
      text-decoration: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(20px);
    }

    .mobile-quick-actions span {
      font-size: 0.78rem;
      font-weight: 800;
    }

    .glass-section {
      margin: 0 0 1rem;
      border-width: 1px 0;
      border-radius: 0;
      background: linear-gradient(180deg, rgba(12, 13, 32, 0.38), rgba(12, 13, 32, 0.2));
      padding: 1rem 0 1.1rem;
      box-shadow: none;
    }

    .section-header {
      margin: 0 0.95rem 0.8rem;
    }

    .section-header h2 {
      font-size: 0.98rem;
    }

    .section-header a {
      min-height: 2.4rem;
      display: inline-flex;
      align-items: center;
      padding: 0 0.35rem;
    }

    .companion-grid,
    .game-grid,
    .world-grid {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(10.5rem, 68vw);
      grid-template-columns: none;
      gap: 0.78rem;
      overflow-x: auto;
      padding: 0 0.95rem 0.45rem;
      scroll-padding-inline: 0.95rem;
      scroll-snap-type: x proximity;
      -webkit-overflow-scrolling: touch;
    }

    .game-grid,
    .world-grid {
      grid-auto-columns: minmax(9.8rem, 58vw);
    }

    .companion-grid > :global(*),
    .game-grid > :global(*),
    .world-grid > :global(*) {
      scroll-snap-align: start;
    }

    .summon-card {
      min-height: 13.4rem;
    }

    .lower-grid {
      display: block;
    }

    .mobile-bottom-nav {
      position: fixed;
      left: 0.65rem;
      right: 0.65rem;
      bottom: max(0.6rem, env(safe-area-inset-bottom));
      z-index: 30;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0.18rem;
      border: 1px solid rgba(183, 140, 255, 0.26);
      border-radius: 1.35rem;
      background: rgba(9, 10, 28, 0.82);
      padding: 0.45rem;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(24px);
    }

    .mobile-bottom-nav a {
      display: grid;
      min-height: 3.45rem;
      place-items: center;
      align-content: center;
      gap: 0.18rem;
      border-radius: 1rem;
      color: rgba(231, 228, 248, 0.68);
      text-decoration: none;
    }

    .mobile-bottom-nav a.active {
      background: linear-gradient(180deg, rgba(142, 92, 255, 0.28), rgba(77, 244, 255, 0.08));
      color: white;
      box-shadow: inset 0 0 0 1px rgba(184, 154, 255, 0.18);
    }

    .mobile-bottom-nav span {
      font-size: 0.62rem;
      font-weight: 800;
    }
  }

  @media (max-width: 520px) {
    .companion-grid {
      grid-auto-columns: minmax(10.5rem, 74vw);
    }

    .game-grid,
    .world-grid {
      grid-auto-columns: minmax(9.6rem, 63vw);
    }
  }
</style>
