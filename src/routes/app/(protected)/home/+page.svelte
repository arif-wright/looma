<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { Gamepad2, Gift, Heart, Home, Leaf, Menu, MessageCircle, Plus, Search, Sparkles, UserRound } from 'lucide-svelte';
  import ActivityFeed from '$lib/components/home/fantasy/ActivityFeed.svelte';
  import CompanionCard from '$lib/components/home/fantasy/CompanionCard.svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import FriendStatusPanel from '$lib/components/home/fantasy/FriendStatusPanel.svelte';
  import GameCard from '$lib/components/home/fantasy/GameCard.svelte';
  import HeroLivingWorld from '$lib/components/home/fantasy/HeroLivingWorld.svelte';
  import RitualPanel from '$lib/components/home/fantasy/RitualPanel.svelte';
  import WorldCard from '$lib/components/home/fantasy/WorldCard.svelte';
  import MemvoyaBrand from '$lib/components/brand/MemvoyaBrand.svelte';
  import DesktopTopbarActions from '$lib/components/layout/DesktopTopbarActions.svelte';
  import { resolveCanonicalArchetypeId } from '$lib/onboarding/archetypes';
  import type { PageData } from './$types';

  export let data: PageData;
  let pageMounted = false;
  let heroModelLoaded = false;
  let settingActiveCompanionId: string | null = null;
  let optimisticActiveCompanionId: string | null = null;
  let optimisticCompanionName: string | null = null;

  const gameCards = [
    { title: 'Arcane Realms', level: 'Lv. 24', progress: 87, stat: '87%', cover: 'arcane' },
    { title: 'Battle Stadium', level: 'Lv. 18', progress: 65, stat: '65%', cover: 'ember' },
    { title: 'Skybound Odyssey', level: 'Lv. 12', progress: 40, stat: '40%', cover: 'sky' },
    { title: 'Mystic Mayhem', level: 'Lv. 9', progress: 20, stat: '20%', cover: 'void' }
  ];

  const worldCards = [
    { name: 'Memvoya Prime', level: 24, players: '1.2K', reward: 24, tone: 'violet' },
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
    companionScale: string;
    mobileStageTop: string;
    mobileStageBottom: string;
    mobileStageWidth: string;
    mobileStageHeight: string;
    mobileStageTranslateY: string;
    mobileCompanionScale: string;
    bridgePrimaryRgb: string;
    bridgeSecondaryRgb: string;
    bridgeAccentRgb: string;
    bridgeShadowRgb: string;
    bridgeIntensity: string;
    bridgeGroundWidth: string;
    bridgeGroundHeight: string;
    bridgeGroundBottom: string;
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
    companionScale: '1',
    mobileStageTop: '8.5rem',
    mobileStageBottom: '7.4rem',
    mobileStageWidth: 'min(25rem, 112vw)',
    mobileStageHeight: 'min(28rem, 58svh)',
    mobileStageTranslateY: '0',
    mobileCompanionScale: '1',
    bridgePrimaryRgb: '155 92 255',
    bridgeSecondaryRgb: '94 242 255',
    bridgeAccentRgb: '255 112 223',
    bridgeShadowRgb: '9 5 28',
    bridgeIntensity: '0.86',
    bridgeGroundWidth: '54%',
    bridgeGroundHeight: '15%',
    bridgeGroundBottom: '4%'
  };

  // Tuned from the platform/landing spot in each generated background. Keeping
  // these values data-driven lets art changes be calibrated without touching layout CSS.
  const heroScenePlacementByArchetype: Record<string, Partial<HeroScenePlacement>> = {
    echo: {
      backgroundPosition: '51% top',
      mobileBackgroundPosition: '52% top',
      stageLeft: '39%',
      stageRight: '17%',
      stageTranslateY: '0.2rem',
      bridgePrimaryRgb: '121 121 255',
      bridgeSecondaryRgb: '112 232 255',
      bridgeAccentRgb: '207 166 255',
      bridgeShadowRgb: '6 15 38'
    },
    guardian: {
      backgroundPosition: '50% top',
      mobileBackgroundPosition: '51% top',
      stageLeft: '39%',
      stageRight: '18%',
      stageTranslateY: '0.1rem',
      bridgePrimaryRgb: '255 182 92',
      bridgeSecondaryRgb: '118 214 255',
      bridgeAccentRgb: '245 219 149',
      bridgeShadowRgb: '25 14 8',
      bridgeIntensity: '0.72'
    },
    muse: {
      backgroundPosition: 'center top',
      mobileBackgroundPosition: 'center top',
      stageLeft: '31%',
      stageRight: '30%',
      stageWidth: 'min(29rem, 116%)',
      stageHeight: 'min(30rem, 124%)',
      stageTranslateX: '0.65rem',
      stageTranslateY: '-1.25rem',
      companionScale: '1',
      mobileStageWidth: 'min(18.5rem, 84vw)',
      mobileStageHeight: 'min(20rem, 48svh)',
      mobileStageTranslateY: '1.2rem',
      mobileCompanionScale: '1',
      bridgePrimaryRgb: '176 92 255',
      bridgeSecondaryRgb: '104 229 255',
      bridgeAccentRgb: '255 150 226',
      bridgeShadowRgb: '15 8 42',
      bridgeIntensity: '0.48',
      bridgeGroundWidth: '54%',
      bridgeGroundHeight: '10%',
      bridgeGroundBottom: '18%'
    },
    root: {
      backgroundPosition: '49% top',
      mobileBackgroundPosition: '50% top',
      stageLeft: '38%',
      stageRight: '18%',
      stageTranslateY: '0.35rem',
      bridgePrimaryRgb: '126 255 201',
      bridgeSecondaryRgb: '166 233 77',
      bridgeAccentRgb: '96 214 132',
      bridgeShadowRgb: '6 28 18'
    },
    spark: {
      backgroundPosition: '52% top',
      mobileBackgroundPosition: '53% top',
      stageLeft: '41%',
      stageRight: '16%',
      stageTranslateY: '-0.05rem',
      bridgePrimaryRgb: '255 126 74',
      bridgeSecondaryRgb: '94 242 255',
      bridgeAccentRgb: '255 221 83',
      bridgeShadowRgb: '31 10 8',
      bridgeIntensity: '0.94'
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
      `--hero-companion-scale: ${placement.companionScale}`,
      `--hero-stage-mobile-top: ${placement.mobileStageTop}`,
      `--hero-stage-mobile-bottom: ${placement.mobileStageBottom}`,
      `--hero-stage-mobile-width: ${placement.mobileStageWidth}`,
      `--hero-stage-mobile-height: ${placement.mobileStageHeight}`,
      `--hero-stage-mobile-translate-y: ${placement.mobileStageTranslateY}`,
      `--hero-companion-mobile-scale: ${placement.mobileCompanionScale}`,
      `--hero-bridge-primary-rgb: ${placement.bridgePrimaryRgb}`,
      `--hero-bridge-secondary-rgb: ${placement.bridgeSecondaryRgb}`,
      `--hero-bridge-accent-rgb: ${placement.bridgeAccentRgb}`,
      `--hero-bridge-shadow-rgb: ${placement.bridgeShadowRgb}`,
      `--hero-bridge-intensity: ${placement.bridgeIntensity}`,
      `--hero-bridge-ground-width: ${placement.bridgeGroundWidth}`,
      `--hero-bridge-ground-height: ${placement.bridgeGroundHeight}`,
      `--hero-bridge-ground-bottom: ${placement.bridgeGroundBottom}`
    ].join('; ');

  const normalizedMood = (value: string | null | undefined) => {
    const mood = value?.trim();
    if (!mood) return 'Happy';
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  };

  const resolveSceneArchetype = (value: string | null | undefined) => resolveCanonicalArchetypeId(value, 'muse');
  const companionAccent = (species: string | null | undefined, index: number): string => {
    const archetype = resolveSceneArchetype(species);
    if (archetype === 'spark') return 'ember';
    if (archetype === 'root') return 'verdant';
    if (archetype === 'guardian') return 'silver';
    if (archetype === 'echo') return 'violet';
    return ['violet', 'silver', 'ember', 'verdant'][index % 4] ?? 'violet';
  };
  const numberOr = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  $: activeCompanion = data.activeCompanion ?? null;
  $: activeCompanionId = optimisticActiveCompanionId ?? activeCompanion?.id ?? null;
  $: playerName =
    (data as any)?.profile?.display_name ??
    (data as any)?.user?.user_metadata?.name ??
    (data as any)?.user?.email?.split('@')?.[0] ??
    'Alex';
  $: profileAvatarUrl =
    (data as any)?.profile?.avatar_url ??
    (data as any)?.user?.user_metadata?.avatar_url ??
    (data as any)?.user?.user_metadata?.picture ??
    null;
  $: shardBalance = Math.max(
    0,
    Math.floor(
      (data as any)?.shardBalance ??
        (data.wallet as any)?.shards ??
        (data.wallet as any)?.balance ??
        0
    )
  );
  $: playerLevel = Math.max(1, Math.floor((data.stats as any)?.level ?? activeCompanion?.bondLevel ?? 24));
  $: playerXp = Math.max(0, Math.floor((data.stats as any)?.xp ?? 3200));
  $: playerXpNext = Math.max(playerXp + 1, Math.floor((data.stats as any)?.xp_next ?? 5000));
  $: companionName = optimisticCompanionName ?? activeCompanion?.name ?? 'Lumi';
  $: activeCompanionHref = activeCompanion?.id ? `/app/companions?focus=${encodeURIComponent(activeCompanion.id)}` : '/app/companions';
  $: companionArchetype = resolveSceneArchetype(activeCompanion?.species);
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
          id: creature.id,
          name: creature.name ?? 'Companion',
          level: Math.max(
            1,
            Math.floor(
              numberOr((creature.stats as any)?.bond_level, ((creature.affection ?? 40) + (creature.trust ?? 40)) / 10)
            )
          ),
          bond: Math.min(
            100,
            Math.max(
              0,
              Math.round(numberOr((creature.stats as any)?.bond_score, ((creature.affection ?? 60) + (creature.trust ?? 60)) / 2))
            )
          ),
          mood: normalizedMood(creature.mood_label ?? creature.mood),
          accent: companionAccent(creature.species, index),
          favorite: creature.id === activeCompanionId || Boolean(creature.is_active),
          avatarUrl: creature.avatar_url ?? null,
          activating: settingActiveCompanionId === creature.id,
          href: `/app/companions?focus=${encodeURIComponent(creature.id)}`
        }))
      : [];
  $: showHomeSplash = !pageMounted || !heroModelLoaded;

  const activateHomeCompanion = async (id: string) => {
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId || settingActiveCompanionId || targetId === activeCompanionId) return;
    settingActiveCompanionId = targetId;
    optimisticActiveCompanionId = targetId;

    try {
      const response = await fetch('/api/companions/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: targetId })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to set active companion');
      }
      await invalidateAll();
    } catch (error) {
      console.error('[home] set active companion failed', error);
      optimisticActiveCompanionId = activeCompanion?.id ?? null;
    } finally {
      settingActiveCompanionId = null;
    }
  };

  const renameHomeCompanion = async (id: string, name: string) => {
    const targetId = typeof id === 'string' ? id.trim() : '';
    const nextName = typeof name === 'string' ? name.trim() : '';
    if (!targetId || nextName.length < 1 || nextName.length > 32) return;
    const previousName = optimisticCompanionName;
    optimisticCompanionName = nextName;

    try {
      const response = await fetch('/api/companions/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: targetId, name: nextName })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to rename companion');
      }
      await invalidateAll();
      optimisticCompanionName = null;
    } catch (error) {
      optimisticCompanionName = previousName;
      throw error;
    }
  };

  onMount(() => {
    pageMounted = true;
  });
</script>

<svelte:head>
  <title>Memvoya | Home</title>
</svelte:head>

<div class="fantasy-home" style={heroSceneStyle}>
  {#if showHomeSplash}
    <div class="page-splash" role="status" aria-live="polite" aria-label="Loading Memvoya home">
      <div class="page-splash__orb" aria-hidden="true"></div>
      <div class="page-splash__copy">
        <strong>Opening your world</strong>
        <span>Gathering {companionName}'s glow...</span>
      </div>
    </div>
  {/if}

  <FantasySidebar
    playerName={playerName}
    level={playerLevel}
    xp={playerXp}
    xpNext={playerXpNext}
    activePath={$page.url.pathname}
  />

  <main class="home-main" aria-label="Memvoya companion home">
    <header class="topbar">
      <div class="mobile-brand">
        <MemvoyaBrand href="/app/home" size="sm" showMark={false} ariaLabel="Memvoya home" />
      </div>
      <label class="search" aria-label="Search Memvoya">
        <Search size={19} />
        <input type="search" placeholder="Search worlds, games, companions, or friends..." />
        <span>⌘K</span>
      </label>
      <div class="top-actions">
        <DesktopTopbarActions
          {shardBalance}
          notifications={(data as any)?.notifications ?? []}
          profileDisplayName={playerName}
          {profileAvatarUrl}
        />
        <button class="menu-action" type="button" aria-label="Open menu"><Menu size={27} /></button>
      </div>
    </header>

    <div class="content-grid">
      <section class="center-stack">
        <HeroLivingWorld
          bind:modelLoaded={heroModelLoaded}
          companionId={activeCompanion?.id ?? null}
          companionHref={activeCompanionHref}
          playerName={playerName}
          companionName={companionName}
          level={companionLevel}
          mood={companionMood}
          bond={companionBond}
          onRename={renameHomeCompanion}
        />

        <section class="mobile-loop" aria-label="Today's companion loop">
          <div class="mobile-quick-actions">
            <a class="mobile-action-card mobile-action-card--bond" href="/app/games">
              <Sparkles size={19} />
              <span>Play Together</span>
              <small>+ Bond</small>
            </a>
            <a class="mobile-action-card mobile-action-card--energy" href="/app/companions">
              <Leaf size={19} />
              <span>Feed {companionName}</span>
              <small>+ Energy</small>
            </a>
            <a class="mobile-action-card mobile-action-card--world" href="/app/worlds">
              <Gamepad2 size={19} />
              <span>Enter World</span>
              <small>+ Adventure</small>
            </a>
            <a class="mobile-action-card mobile-action-card--gift" href="/app/inventory">
              <Gift size={19} />
              <span>Open Gift</span>
              <small>1 Ready</small>
            </a>
          </div>
          <RitualPanel completed={ritualCompleted} />
        </section>

        <section class="glass-section companions-section" aria-labelledby="companions-title">
          <div class="section-header">
            <h2 id="companions-title">Your Companions</h2>
            <a href="/app/companions">View All</a>
          </div>
          <div class="companion-grid">
            {#each companions as companion}
              <CompanionCard {...companion} onActivate={activateHomeCompanion} />
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
        <ActivityFeed notifications={(data as any)?.notifications ?? []} />
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

  .page-splash {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: grid;
    place-items: center;
    gap: 1.05rem;
    align-content: center;
    background:
      radial-gradient(circle at 50% 42%, rgba(155, 92, 255, 0.34), transparent 18rem),
      radial-gradient(circle at 42% 54%, rgba(94, 242, 255, 0.14), transparent 20rem),
      linear-gradient(135deg, #070719, #090a20 54%, #050714);
    color: white;
  }

  .page-splash__orb {
    width: 6rem;
    height: 6rem;
    border-radius: 999px;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.94), transparent 0.45rem),
      radial-gradient(circle at 50% 50%, rgba(255, 112, 223, 0.88), rgba(128, 92, 255, 0.58) 45%, rgba(94, 242, 255, 0.12) 74%, transparent 76%);
    box-shadow:
      0 0 34px rgba(178, 83, 255, 0.6),
      0 0 70px rgba(94, 242, 255, 0.22);
    animation: splashPulse 1.6s ease-in-out infinite;
  }

  .page-splash__copy {
    display: grid;
    gap: 0.35rem;
    text-align: center;
  }

  .page-splash__copy strong {
    font-size: clamp(1.05rem, 2vw, 1.3rem);
  }

  .page-splash__copy span {
    color: rgba(231, 225, 255, 0.72);
    font-size: 0.88rem;
  }

  @keyframes splashPulse {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.82;
    }
    50% {
      transform: translateY(-0.35rem) scale(1.04);
      opacity: 1;
    }
  }

  .home-main::before,
  .home-main::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: clamp(31rem, 42vw, 36rem);
    pointer-events: none;
  }

  .home-main::before {
    z-index: 0;
    background-image:
      linear-gradient(90deg, transparent 0%, transparent 67%, rgba(5, 7, 20, 0.18) 80%, rgba(5, 7, 20, 0.74) 100%),
      var(--home-bg-image);
    background-position:
      center,
      var(--home-bg-position, center top);
    background-size:
      cover,
      cover;
    opacity: 0.9;
    transform: scale(1.01);
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 58%, rgba(0, 0, 0, 0.78) 70%, transparent 100%);
    mask-image: linear-gradient(to bottom, #000 0%, #000 58%, rgba(0, 0, 0, 0.78) 70%, transparent 100%);
  }

  .home-main::after {
    z-index: 1;
    background:
      radial-gradient(circle at 17% 22%, rgba(var(--hero-bridge-secondary-rgb) / 0.64) 0 0.08rem, transparent 0.18rem),
      radial-gradient(circle at 31% 34%, rgba(var(--hero-bridge-primary-rgb) / 0.5) 0 0.1rem, transparent 0.22rem),
      radial-gradient(circle at 47% 19%, rgba(var(--hero-bridge-accent-rgb) / 0.48) 0 0.08rem, transparent 0.2rem),
      radial-gradient(circle at 64% 31%, rgba(var(--hero-bridge-secondary-rgb) / 0.5) 0 0.09rem, transparent 0.21rem),
      radial-gradient(circle at 79% 17%, rgba(var(--hero-bridge-primary-rgb) / 0.46) 0 0.1rem, transparent 0.24rem),
      radial-gradient(circle at 88% 42%, rgba(var(--hero-bridge-accent-rgb) / 0.38) 0 0.08rem, transparent 0.21rem),
      radial-gradient(circle at 23% 56%, rgba(var(--hero-bridge-primary-rgb) / 0.38) 0 0.08rem, transparent 0.21rem),
      radial-gradient(circle at 58% 53%, rgba(var(--hero-bridge-secondary-rgb) / 0.42) 0 0.09rem, transparent 0.22rem),
      radial-gradient(circle at 72% 67%, rgba(var(--hero-bridge-accent-rgb) / 0.34) 0 0.08rem, transparent 0.22rem);
    filter: blur(0.1px) drop-shadow(0 0 10px rgba(var(--hero-bridge-secondary-rgb) / 0.32));
    opacity: calc(0.48 * var(--hero-bridge-intensity, 0.86));
    transform: translate3d(0, 0, 0);
    animation: ambientHeroMotes 14s ease-in-out infinite alternate;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 10%, #000 76%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, #000 10%, #000 76%, transparent 100%);
  }

  .home-main {
    position: relative;
    z-index: 2;
    min-width: 0;
    padding: 1.5rem 1.35rem 1.35rem;
  }

  @keyframes ambientHeroMotes {
    0% {
      transform: translate3d(-0.25rem, 0.15rem, 0);
      opacity: calc(0.36 * var(--hero-bridge-intensity, 0.86));
    }
    48% {
      transform: translate3d(0.35rem, -0.45rem, 0);
    }
    100% {
      transform: translate3d(0.65rem, -0.9rem, 0);
      opacity: calc(0.52 * var(--hero-bridge-intensity, 0.86));
    }
  }

  .topbar,
  .content-grid {
    position: relative;
    z-index: 2;
  }

  .topbar {
    z-index: 80;
  }

  .mobile-brand,
  .menu-action {
    display: none;
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

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 19rem;
    gap: 1.95rem;
    align-items: start;
  }

  .center-stack,
  .right-stack {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .right-stack {
    transform: translateX(0.22rem);
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
      transform: none;
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
      height: min(48rem, 92svh);
      opacity: 0.96;
    }

    :global(.fantasy-sidebar) {
      display: none;
    }

    .home-main {
      padding: 0;
    }

    .topbar {
      position: fixed;
      left: 1.25rem;
      right: 1.25rem;
      top: max(1.05rem, calc(env(safe-area-inset-top) + 0.45rem));
      z-index: 20;
      margin: 0;
      pointer-events: auto;
    }

    .mobile-brand {
      display: inline-flex;
      align-items: center;
    }

    .search {
      display: none;
    }

    .top-actions {
      width: auto;
      justify-content: flex-end;
      gap: 0.65rem;
    }

    .menu-action {
      display: inline-grid;
      width: 2.55rem;
      min-height: 2.55rem;
      place-items: center;
      border: 0;
      background: transparent;
      color: #fff3cf;
      padding: 0;
      cursor: pointer;
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
      gap: 1rem;
      margin: -0.25rem 1.05rem 1rem;
      position: relative;
      z-index: 4;
    }

    .mobile-quick-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.62rem;
    }

    .mobile-quick-actions a {
      display: grid;
      min-height: 7.1rem;
      place-items: center;
      align-content: center;
      gap: 0.38rem;
      border: 1px solid rgba(167, 92, 255, 0.32);
      border-radius: 1.1rem;
      background:
        radial-gradient(circle at 50% 24%, rgba(171, 92, 255, 0.34), transparent 46%),
        rgba(10, 10, 29, 0.74);
      color: white;
      text-decoration: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(20px);
      text-align: center;
    }

    .mobile-action-card--energy {
      border-color: rgba(125, 213, 80, 0.32);
      background:
        radial-gradient(circle at 50% 24%, rgba(125, 213, 80, 0.25), transparent 46%),
        rgba(10, 18, 20, 0.72);
    }

    .mobile-action-card--world {
      border-color: rgba(75, 141, 255, 0.36);
      background:
        radial-gradient(circle at 50% 24%, rgba(75, 141, 255, 0.26), transparent 46%),
        rgba(9, 13, 29, 0.74);
    }

    .mobile-action-card--gift {
      border-color: rgba(227, 169, 67, 0.36);
      background:
        radial-gradient(circle at 50% 24%, rgba(227, 169, 67, 0.28), transparent 46%),
        rgba(23, 15, 12, 0.72);
    }

    .mobile-quick-actions :global(svg) {
      width: 2.15rem;
      height: 2.15rem;
      filter: drop-shadow(0 0 16px currentColor);
    }

    .mobile-quick-actions span {
      font-size: clamp(0.74rem, 3.4vw, 0.92rem);
      font-weight: 800;
      line-height: 1.12;
    }

    .mobile-quick-actions small {
      color: #bd7cff;
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1.1;
    }

    .mobile-action-card--energy small {
      color: #8ed45d;
    }

    .mobile-action-card--world small {
      color: #6fa2ff;
    }

    .mobile-action-card--gift small {
      color: #e4b65a;
    }

    .glass-section {
      margin: 0 1.05rem 1rem;
      border-width: 1px;
      border-radius: 1.15rem;
      background: rgba(12, 13, 32, 0.56);
      padding: 1rem 0 1.1rem;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 18px 50px rgba(0, 0, 0, 0.28);
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
