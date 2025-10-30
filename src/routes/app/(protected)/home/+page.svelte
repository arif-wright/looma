<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
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
    if (!browser || !preferences) return;
    const contextKind = extractContext(preferences.last_context ?? null);
    if (contextKind !== 'feed') return;
    const payload = preferences.last_context_payload as Record<string, unknown> | null;
    const scrollValue =
      payload && typeof payload.scroll === 'number' ? Math.max(0, payload.scroll) : null;
    if (scrollValue === null) return;
    await tick();
    window.scrollTo({ top: scrollValue, behavior: 'auto' });
  });
</script>

<main class="home-surface" aria-labelledby="home-heading">
  <h1 id="home-heading" class="sr-only">Home</h1>

  <section class="hero-grid">
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
  </section>

  <section class="missions-section" aria-labelledby="missions-heading">
    <div class="section-heading">
      <h2 id="missions-heading">Stay on track</h2>
      <a href="/app/missions" class="see-all">All missions</a>
    </div>
    <MissionRow items={missions} />
  </section>

  <section class="feed-section" aria-labelledby="feed-heading">
    <div class="section-heading">
      <h2 id="feed-heading">From your circle</h2>
      <a href="/app/u/me" class="see-all">View profile</a>
    </div>
    <FeedList items={feed} />
  </section>

  <section class="creatures-section" aria-labelledby="creatures-heading">
    <div class="section-heading">
      <h2 id="creatures-heading">Creature moments</h2>
      <a href="/app/creatures" class="see-all">Manage creatures</a>
    </div>
    <CreatureMoments items={creatures} />
  </section>

  <section class="endcap-section" aria-labelledby="endcap-heading">
    <EndcapCard {endcap} id="endcap-heading" />
  </section>
</main>

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

  .home-surface {
    display: grid;
    gap: 32px;
    padding: 24px;
    max-width: 1160px;
    margin: 0 auto 120px;
  }

  .hero-grid {
    display: grid;
    gap: 24px;
  }

  .missions-section,
  .feed-section,
  .creatures-section,
  .endcap-section {
    display: grid;
    gap: 16px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .see-all {
    font-size: 0.85rem;
    color: rgba(125, 211, 252, 0.9);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .see-all:hover,
  .see-all:focus-visible {
    text-decoration: underline;
  }

  @media (min-width: 960px) {
    .hero-grid {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      align-items: stretch;
    }
  }

  @media (max-width: 640px) {
    .home-surface {
      padding: 16px;
    }
  }
</style>
