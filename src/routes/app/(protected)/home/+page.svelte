<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ConstellationNav, { type NavItem } from '$lib/components/home/ConstellationNav.svelte';
  import StatusCapsule from '$lib/components/home/StatusCapsule.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import TodayCard from '$lib/components/home/TodayCard.svelte';
  import ComposerChip from '$lib/components/home/ComposerChip.svelte';
  import FeedList from '$lib/components/home/FeedList.svelte';
  import MissionRow from '$lib/components/home/MissionRow.svelte';
  import CreatureMoments from '$lib/components/home/CreatureMoments.svelte';
  import EndcapCard from '$lib/components/home/EndcapCard.svelte';

  import type { PageData } from './$types';

  export let data: PageData;

  const stats = data.stats;
  const feed = data.feed ?? [];
  const missions = data.missions ?? [];
  const creatures = data.creatures ?? [];
  const endcap = data.endcap;
  const variant = data.landingVariant ?? null;
  const preferences = data.preferences ?? null;
  const notificationsUnread = data.notificationsUnread ?? 0;

  const energy = stats?.energy ?? 0;
  const energyMax = stats?.energy_max ?? 0;
  const streak = stats?.missions_completed ?? 0;
  const petMood = creatures[0]?.mood_label ?? creatures[0]?.mood ?? null;
  const activeMission = missions[0]
    ? {
        id: missions[0].id,
        name: missions[0].title ?? null,
        summary: missions[0].summary ?? null,
        difficulty: missions[0].difficulty ?? null
      }
    : null;

  const navItems: NavItem[] = [
    { id: 'bond', label: 'Resonance', description: 'Pulse & composer' },
    { id: 'missions', label: 'Missions', description: 'Next moves' },
    { id: 'feed', label: 'Circle', description: 'Community signals' },
    { id: 'companions', label: 'Companions', description: 'Care & moods' },
    { id: 'path', label: 'Path', description: 'Suggested focus' }
  ];

  let activeSection = navItems[0].id;

  const extractContext = (entry: unknown): string | null => {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
      const context = (entry as Record<string, unknown>).context;
      return typeof context === 'string' ? context : null;
    }
    return null;
  };

  onMount(async () => {
    if (!browser) return;

    if (preferences) {
      const contextKind = extractContext(preferences.last_context ?? null);
      if (contextKind === 'feed') {
        const payload = preferences.last_context_payload as Record<string, unknown> | null;
        const scrollValue =
          payload && typeof payload.scroll === 'number' ? Math.max(0, payload.scroll) : null;
        if (scrollValue !== null) {
          await tick();
          window.scrollTo({ top: scrollValue, behavior: 'auto' });
        }
      }
    }

    await tick();

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute('id');
          if (id) {
            activeSection = id;
          }
        }
      },
      {
        threshold: 0.42,
        rootMargin: '-20% 0px -40% 0px'
      }
    );

    navItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  });
</script>

<BackgroundStack />

<div class="home-frame">
  <ConstellationNav items={navItems} {activeSection} />

  <main class="home-main" aria-labelledby="home-heading">
    <h1 id="home-heading" class="sr-only">Hybrid home dashboard</h1>

    <section id="bond" class="section-anchor">
      <OrbPanel
        headline="Your bond pulses brighter today."
        subtitle="Energy renewed. The thread hums with potential."
        data-testid="orb-panel"
      >
        <TodayCard
          {stats}
          mission={missions[0] ?? null}
          creature={creatures[0] ?? null}
          {variant}
          {energy}
          {energyMax}
          {streak}
          {petMood}
          {activeMission}
          pendingReward={false}
          recentFail={null}
        />
        <ComposerChip className="composer-chip" />
      </OrbPanel>
    </section>

    <section id="missions" class="section-anchor">
      <OrbPanel
        headline="Guide the loop forward."
        subtitle="Pick a mission thread to keep your synergy alive."
        data-testid="orb-panel"
      >
        <div class="panel-heading">
          <a href="/app/missions" class="cta-link">All missions</a>
        </div>
        <MissionRow items={missions} />
      </OrbPanel>
    </section>

    <section id="feed" class="section-anchor">
      <OrbPanel
        headline="Signals from your circle."
        subtitle="Share a resonance, respond with warmth, stay woven together."
        data-testid="orb-panel"
      >
        <FeedList items={feed} />
      </OrbPanel>
    </section>

    <section id="companions" class="section-anchor">
      <OrbPanel
        headline="Companion pulse"
        subtitle="Attune to each mood and keep the bond glowing."
        data-testid="orb-panel"
      >
        <CreatureMoments items={creatures} />
      </OrbPanel>
    </section>

    <section id="path" class="section-anchor">
      <OrbPanel
        headline="Where the thread invites you next."
        subtitle="A gentle nudge when you’re ready to move."
        data-testid="orb-panel"
      >
        <EndcapCard {endcap} />
      </OrbPanel>
    </section>
  </main>

  <div class="home-aside">
    <StatusCapsule
      level={stats?.level ?? null}
      xp={stats?.xp ?? null}
      xpNext={stats?.xp_next ?? null}
      energy={stats?.energy ?? null}
      energyMax={stats?.energy_max ?? null}
      notifications={notificationsUnread}
    />
  </div>
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .home-frame {
    position: relative;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 320px;
    gap: clamp(24px, 4vw, 48px);
    padding: clamp(24px, 5vw, 72px) clamp(20px, 5vw, 72px) clamp(120px, 10vw, 160px);
    min-height: 100vh;
  }

  .home-main {
    display: grid;
    gap: clamp(28px, 4vw, 40px);
    position: relative;
    z-index: 1;
  }

  .home-aside {
    display: flex;
    justify-content: flex-start;
  }

  .section-anchor {
    scroll-margin-top: 110px;
  }

  .panel-heading {
    display: flex;
    justify-content: flex-end;
  }

  .cta-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.55rem 1.05rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(244, 247, 255, 0.9);
    font-size: 0.88rem;
    text-decoration: none;
    transition: transform 160ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .cta-link::after {
    content: '→';
    font-size: 1rem;
  }

  .cta-link:hover,
  .cta-link:focus-visible {
    transform: translateY(-1px);
    background: rgba(77, 244, 255, 0.28);
    box-shadow: 0 14px 30px rgba(77, 244, 255, 0.24);
  }

  .cta-link:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 14px 30px rgba(77, 244, 255, 0.24);
  }

  @media (max-width: 1280px) {
    .home-frame {
      grid-template-columns: minmax(0, 1fr) 320px;
    }

    .home-frame > :first-child {
      display: none;
    }
  }

  @media (max-width: 1024px) {
    .home-frame {
      grid-template-columns: minmax(0, 1fr);
      padding: clamp(20px, 6vw, 48px);
    }

    .home-aside {
      order: -1;
    }
  }

  @media (max-width: 680px) {
    .home-main {
      gap: 24px;
    }
  }
</style>
