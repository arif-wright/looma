<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import TodayCard from '$lib/components/home/TodayCard.svelte';
  import FeedList from '$lib/components/home/FeedList.svelte';
  import MissionRow from '$lib/components/home/MissionRow.svelte';
  import CreatureMoments from '$lib/components/home/CreatureMoments.svelte';
  import EndcapCard from '$lib/components/home/EndcapCard.svelte';
  import StatusCapsule from '$lib/components/home/StatusCapsule.svelte';
  import QuickLinks, { type QuickLink } from '$lib/components/home/QuickLinks.svelte';
  import QuickPostPanel from '$lib/components/home/QuickPostPanel.svelte';

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

  const quickLinks: QuickLink[] = [
    { id: 'resonance', label: 'Resonance', description: 'Pulse & composer', href: '/app/home#resonance', icon: '✶' },
    { id: 'missions', label: 'Missions', description: 'Thread your next move', href: '/app/missions', icon: '⬢' },
    { id: 'feed', label: 'Circle', description: 'Community signals', href: '/app/home#feed', icon: '●' },
    { id: 'companions', label: 'Companions', description: 'Care & moods', href: '/app/creatures', icon: '◎' },
    { id: 'path', label: 'Path', description: 'Suggested focus', href: '/app/home#path', icon: '↗' }
  ];

  const handleQuickPost = () => {
    if (browser) {
      window.location.reload();
    }
  };

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
  });
</script>

<div class="bg-neuro min-h-screen relative overflow-hidden">
  <BackgroundStack />

<main
  class="relative z-10 mx-auto min-h-screen w-full max-w-7xl px-5 pb-28 pt-24 lg:px-10"
  aria-labelledby="home-heading"
>
  <h1 id="home-heading" class="sr-only">Hybrid home dashboard</h1>
  <div class="grid gap-6 lg:grid-cols-12">
    <section class="space-y-6 lg:col-span-3">
      <QuickLinks links={quickLinks} />
    </section>

    <section class="space-y-6 lg:col-span-6">
      <OrbPanel
        headline="Your bond pulses brighter today."
        subtitle="Energy renewed. The thread hums with potential."
        data-testid="orb-panel"
        id="resonance"
        class="space-y-6"
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
      </OrbPanel>

      <OrbPanel
        headline="Guide the loop forward."
        subtitle="Pick a mission thread to keep your synergy alive."
        data-testid="orb-panel"
        id="missions"
        class="space-y-4"
      >
        <div class="flex justify-end">
          <a href="/app/missions" class="cta-link hover-glow">All missions</a>
        </div>
        <MissionRow items={missions} />
      </OrbPanel>

      <OrbPanel
        headline="Signals from your circle."
        subtitle="Share a resonance, respond with warmth, stay woven together."
        data-testid="orb-panel"
        id="feed"
        class="space-y-4"
      >
        <FeedList items={feed} />
      </OrbPanel>

      <OrbPanel
        headline="Companion pulse"
        subtitle="Attune to each mood and keep the bond glowing."
        data-testid="orb-panel"
        id="companions"
        class="space-y-4"
      >
        <CreatureMoments items={creatures} />
      </OrbPanel>

      <OrbPanel
        headline="Whisper something kind."
        subtitle="Tiny sparks build the field."
        data-testid="orb-panel"
        id="quick-post"
        class="space-y-3 p-4"
      >
        <QuickPostPanel on:posted={handleQuickPost} />
      </OrbPanel>

      <OrbPanel
        headline="Where the thread invites you next."
        subtitle="A gentle nudge when you’re ready to move."
        data-testid="orb-panel"
        id="path"
        class="space-y-4"
      >
        <EndcapCard {endcap} />
      </OrbPanel>
    </section>

    <aside class="space-y-6 lg:col-span-3" aria-label="Status overview">
      <OrbPanel class="space-y-5 telemetry-panel relative overflow-hidden p-6" data-testid="level-panel">
        <header class="space-y-1">
          <p class="text-xs uppercase tracking-[0.2em] text-white/80">Signal status</p>
          <h2 class="text-2xl font-semibold font-display text-white">Bond telemetry</h2>
        </header>
        <StatusCapsule
          className="status-readout"
          level={stats?.level ?? null}
          xp={stats?.xp ?? null}
          xpNext={stats?.xp_next ?? null}
          energy={stats?.energy ?? null}
          energyMax={stats?.energy_max ?? null}
          notifications={notificationsUnread}
        />
      </OrbPanel>
    </aside>
  </div>

  <hr class="orb-divider mt-14" aria-hidden="true" />
</main>
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

  .cta-link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(244, 247, 255, 0.92);
    font-size: 0.85rem;
    text-decoration: none;
    transition: transform 160ms ease, box-shadow 200ms ease, background 180ms ease;
  }

  .cta-link::after {
    content: '→';
    font-size: 1rem;
  }

  .cta-link:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(77, 244, 255, 0.6);
  }

  :global(.telemetry-panel) {
    position: relative;
    overflow: hidden;
  }

  :global(.telemetry-panel)::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(140% 140% at 0% 0%, rgba(157, 92, 255, 0.28), transparent 70%);
    opacity: 0.35;
    z-index: -1;
    pointer-events: none;
    animation: telemetry-breathe 26s ease-in-out infinite;
  }

  @keyframes telemetry-breathe {
    0%,
    100% {
      opacity: 0.32;
    }

    50% {
      opacity: 0.58;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.telemetry-panel)::before {
      animation: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.hover-glow) {
      transition: none !important;
    }

    :global(.hover-glow:hover),
    :global(.hover-glow:focus-visible) {
      transform: none !important;
      box-shadow: none !important;
    }
  }
</style>
