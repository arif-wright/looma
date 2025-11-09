<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount, tick } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import QuickLinks from '$lib/components/home/QuickLinks.svelte';
  import QuickPostPanel from '$lib/components/home/QuickPostPanel.svelte';
  import FeedList from '$lib/components/home/FeedList.svelte';
  import TodayCard from '$lib/components/home/TodayCard.svelte';
  import MissionRow from '$lib/components/home/MissionRow.svelte';
  import CreatureMoments from '$lib/components/home/CreatureMoments.svelte';
  import EndcapCard from '$lib/components/home/EndcapCard.svelte';
  import TelemetryCapsule from '$lib/components/home/TelemetryCapsule.svelte';
  import PeopleToFollow from '$lib/components/social/PeopleToFollow.svelte';
  import MissionModal from '$lib/app/missions/MissionModal.svelte';
  import type { MissionRow as MissionRowType } from '$lib/data/missions';
  import type { FeedItem as FeedItemType } from '$lib/social/types';
  import type { QuickLink } from '$lib/components/home/types';
  import { PenSquare, MessageCircleHeart, Rss, Target, PawPrint, Compass } from 'lucide-svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const stats = data.stats;
  const missions = data.missions ?? [];
  const creatures = data.creatures ?? [];
  const endcap = data.endcap;
  const variant = data.landingVariant ?? null;
  const preferences = data.preferences ?? null;
  const wallet = data.wallet;
  const walletTx = data.walletTx ?? [];
  const latestWalletTx = walletTx[0] ?? null;
  const initialFeed: FeedItemType[] = Array.isArray(data.feed) ? data.feed : [];

  const quickLinks: QuickLink[] = [
    { id: 'greeting', label: 'Resonance', description: 'Emotional compass', href: '#greeting', icon: PenSquare },
    { id: 'whisper', label: 'Whisper', description: 'Send a kind pulse', href: '#whisper', icon: MessageCircleHeart },
    { id: 'feed', label: 'Circle', description: 'Signals from friends', href: '#feed', icon: Rss },
    { id: 'missions', label: 'Missions', description: 'Pick your next thread', href: '#missions', icon: Target },
    { id: 'companions', label: 'Companions', description: 'Check their mood', href: '#companions', icon: PawPrint },
    { id: 'path', label: 'Path', description: 'Where to wander next', href: '#path', icon: Compass }
  ];

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

  let feedPrepend: FeedItemType | null = null;
  let toast: { message: string } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let missionModalOpen = false;
  let missionModalData: MissionRowType | null = null;

  const showToast = (message: string) => {
    toast = { message };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3200);
  };

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  const normalizeFeedItem = (entry: Record<string, unknown> | null): FeedItemType | null => {
    if (!entry || typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' ? entry.id : null;
    if (!id) return null;
    const createdAt = typeof entry.created_at === 'string' ? entry.created_at : new Date().toISOString();
    const userId = typeof entry.user_id === 'string' ? entry.user_id : (typeof entry.author_id === 'string' ? entry.author_id : 'self');
    return {
      id,
      user_id: userId,
      slug: typeof entry.slug === 'string' ? entry.slug : null,
      kind: typeof entry.kind === 'string' ? entry.kind : 'text',
      body: typeof entry.body === 'string' ? entry.body : '',
      text: typeof entry.text === 'string' ? entry.text : (typeof entry.body === 'string' ? entry.body : ''),
      meta: (entry.meta as Record<string, unknown>) ?? {},
      image_url: (entry.image_url as string | null) ?? null,
      engagement_score: typeof entry.engagement_score === 'number' ? entry.engagement_score : null,
      deep_link_target: (entry.deep_link_target as Record<string, unknown> | null) ?? null,
      is_public: entry.is_public !== false,
      created_at: createdAt,
      author_name: typeof entry.author_name === 'string' ? entry.author_name : 'You',
      author_handle: typeof entry.author_handle === 'string' ? entry.author_handle : null,
      author_avatar: (entry.author_avatar as string | null) ?? null,
      display_name: typeof entry.display_name === 'string' ? entry.display_name : undefined,
      handle: typeof entry.handle === 'string' ? entry.handle : undefined,
      avatar_url: (entry.avatar_url as string | null) ?? undefined,
      comment_count: typeof entry.comment_count === 'number' ? entry.comment_count : 0,
      reaction_like_count: typeof entry.reaction_like_count === 'number' ? entry.reaction_like_count : 0,
      reaction_spark_count: typeof entry.reaction_spark_count === 'number' ? entry.reaction_spark_count : 0,
      reaction_support_count: typeof entry.reaction_support_count === 'number' ? entry.reaction_support_count : 0,
      current_user_reaction:
        entry.current_user_reaction === 'like' ||
        entry.current_user_reaction === 'spark' ||
        entry.current_user_reaction === 'support'
          ? (entry.current_user_reaction as 'like' | 'spark' | 'support')
          : null,
      author_id: typeof entry.author_id === 'string' ? entry.author_id : userId,
      is_follow: entry.is_follow === true,
      engagement: typeof entry.engagement === 'number' ? entry.engagement : 0,
      recency: typeof entry.recency === 'number' ? entry.recency : Date.now(),
      score: typeof entry.score === 'number' ? entry.score : Date.now(),
      shares_count: typeof entry.shares_count === 'number' ? entry.shares_count : undefined
    } satisfies FeedItemType;
  };

  const mapMissionSummary = (summary: (typeof missions)[number] | undefined): MissionRowType | null => {
    if (!summary) return null;
    return {
      id: summary.id,
      title: summary.title ?? null,
      summary: summary.summary ?? null,
      difficulty: summary.difficulty ?? null,
      status: 'available',
      energy_reward: summary.energy_reward ?? null,
      xp_reward: summary.xp_reward ?? null,
      meta: null
    } satisfies MissionRowType;
  };

  const handleQuickPost = (event: CustomEvent<{ item: Record<string, unknown> | null }>) => {
    const normalized = normalizeFeedItem(event.detail?.item ?? null);
    if (normalized) {
      feedPrepend = normalized;
    }
    showToast('Whisper delivered to your circle.');
  };

  const handleStartMission = (event: CustomEvent<{ missionId: string | null; mode: 'resume' | 'quick' | 'retry' }>) => {
    const missionId = event.detail?.missionId ?? null;
    const mode = event.detail?.mode ?? 'quick';
    const target = missionId ? missions.find((mission) => mission.id === missionId) : undefined;
    const mission = mapMissionSummary(target) ?? mapMissionSummary(missions[0]);

    if (!mission) {
      void goto('/app/missions');
      return;
    }

    if (mode === 'resume' && missionId) {
      missionModalData = mission;
      missionModalOpen = true;
      return;
    }

    missionModalData = mission;
    missionModalOpen = true;
  };

  const closeMissionModal = () => {
    missionModalOpen = false;
    missionModalData = null;
  };

  const handleMissionLaunch = (event: CustomEvent<{ missionId: string }>) => {
    const missionId = event.detail?.missionId;
    closeMissionModal();
    if (!missionId) return;
    void goto(`/app/missions/${missionId}`);
  };

  const handleClaimReward = () => {
    void goto('/app/rewards');
  };

  const handleCheckCreature = (event: CustomEvent<{ creatureId: string }>) => {
    const creatureId = event.detail?.creatureId;
    if (!creatureId) return;
    void goto(`/app/creatures?focus=${creatureId}`);
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

<div class="home-root bg-neuro">
  <BackgroundStack />

  <main class="home-shell" aria-labelledby="home-heading">
    <h1 id="home-heading" class="sr-only">Hybrid home dashboard</h1>

    <div class="dashboard-grid">
      <aside class="column-left fade-up" data-delay="0" aria-label="Quick navigation">
        <QuickLinks links={quickLinks} />
      </aside>

      <section class="column-center">
        <article id="greeting" class="panel fade-up" data-delay="0" aria-label="Daily greeting">
          <div class="panel__header">
            <h2 class="panel__title">Your bond pulses brighter today.</h2>
            <p class="panel__subtitle">Let the field settle before you move.</p>
          </div>
          <p class="panel__body">We refreshed your space for calm focus. Glide through whispers, check in on the circle, and decide when to launch your next thread.</p>
        </article>

        <article id="whisper" class="panel fade-up" data-delay="1" aria-label="Whisper composer">
          <div class="panel__header">
            <h2 class="panel__title">Whisper something kind…</h2>
            <p class="panel__subtitle">Tiny sparks keep the resonance alive.</p>
          </div>
          <QuickPostPanel placeholder="Whisper something kind…" on:posted={handleQuickPost} />
        </article>

        <article id="feed" class="panel fade-up" data-delay="2" aria-label="Signals from your circle">
          <div class="panel__header">
            <h2 class="panel__title">Signals from your circle</h2>
            <p class="panel__subtitle">Respond with warmth, stay woven together.</p>
          </div>
          <FeedList items={initialFeed} prepend={feedPrepend} />
        </article>

        <article id="missions" class="panel fade-up" data-delay="3" aria-label="Quick mission">
          <div class="panel__header">
            <h2 class="panel__title">Quick mission</h2>
            <p class="panel__subtitle">Energy and streak align when you do.</p>
          </div>
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
            on:startMission={handleStartMission}
            on:claim={handleClaimReward}
            on:checkCreature={handleCheckCreature}
          />
          {#if missions.length > 1}
            <div class="mission-stack">
              <MissionRow items={missions.slice(0, 3)} />
            </div>
          {/if}
        </article>

        <article id="companions" class="panel fade-up" data-delay="4" aria-label="Companion pulse">
          <div class="panel__header">
            <h2 class="panel__title">Companion pulse</h2>
            <p class="panel__subtitle">Attune to each mood and keep the bond glowing.</p>
          </div>
          <CreatureMoments items={creatures} />
        </article>

        <article id="path" class="panel fade-up" data-delay="5" aria-label="Path forward">
          <div class="panel__header">
            <h2 class="panel__title">Where the thread invites you next</h2>
          </div>
          <EndcapCard id="home-endcap" {endcap} />
        </article>
      </section>

      <aside class="column-right fade-up" data-delay="1" aria-label="Bond telemetry">
        <TelemetryCapsule
          level={stats?.level ?? null}
          xp={stats?.xp ?? null}
          xpNext={stats?.xp_next ?? null}
          walletBalance={wallet?.balance ?? null}
          walletCurrency={wallet?.currency ?? 'shards'}
          walletDelta={latestWalletTx?.amount ?? null}
        />
        <PeopleToFollow title="People you may know" dense />
      </aside>
    </div>

    {#if toast}
      <div class="home-toast" role="status">{toast.message}</div>
    {/if}
  </main>

  <MissionModal open={missionModalOpen} mission={missionModalData} on:close={closeMissionModal} on:launch={handleMissionLaunch} />
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
    white-space: nowrap;
    border: 0;
  }

  .home-root {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
  }

  .home-shell {
    position: relative;
    z-index: 10;
    min-height: 100vh;
    width: 100%;
    max-width: 1680px;
    padding: clamp(2.5rem, 4vw, 4rem) clamp(1.5rem, 3.5vw, 2.75rem) 5.5rem;
    margin: 0 auto;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 260px minmax(640px, 720px) 320px;
    column-gap: clamp(5.5rem, 7vw, 7.5rem);
    row-gap: 1.5rem;
    align-items: start;
    justify-content: space-between;
  }

  .column-left,
  .column-right {
    display: grid;
    gap: 1.5rem;
    position: sticky;
    top: clamp(5rem, 10vw, 6.5rem);
    align-self: start;
    justify-self: stretch;
  }

  .column-left {
    max-width: 260px;
  }

  .column-right {
    justify-self: end;
    width: 320px;
  }

  .column-center {
    display: grid;
    gap: 1.5rem;
    width: clamp(640px, 43vw, 720px);
  }

  .panel {
    display: grid;
    gap: 1.5rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.2rem);
    border-radius: 1.75rem;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 32px 64px rgba(8, 15, 30, 0.45);
    backdrop-filter: blur(18px);
  }

  .panel__header {
    display: grid;
    gap: 0.35rem;
  }

  .panel__title {
    margin: 0;
    font-size: clamp(1.35rem, 2.2vw, 1.8rem);
    font-weight: 600;
    color: rgba(248, 250, 252, 0.98);
  }

  .panel__subtitle {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.62);
  }

  .panel__body {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(226, 232, 240, 0.78);
    line-height: 1.6;
  }

  .mission-stack {
    border-radius: 1.3rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    padding: 1.25rem;
    background: rgba(15, 23, 42, 0.55);
  }

  .home-toast {
    position: fixed;
    left: 50%;
    bottom: 2.5rem;
    transform: translateX(-50%);
    padding: 0.85rem 1.6rem;
    border-radius: 999px;
    background: rgba(45, 212, 191, 0.95);
    color: rgba(8, 15, 30, 0.9);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    box-shadow: 0 20px 38px rgba(45, 212, 191, 0.32);
  }

  .fade-up {
    opacity: 0;
    transform: translateY(18px);
    animation: fadeUp 0.6s ease forwards;
  }

  .fade-up[data-delay='1'] {
    animation-delay: 0.08s;
  }

  .fade-up[data-delay='2'] {
    animation-delay: 0.16s;
  }

  .fade-up[data-delay='3'] {
    animation-delay: 0.24s;
  }

  .fade-up[data-delay='4'] {
    animation-delay: 0.32s;
  }

  .fade-up[data-delay='5'] {
    animation-delay: 0.4s;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fade-up {
      opacity: 1;
      transform: none;
      animation: none;
    }
  }

  @media (max-width: 1280px) {
    .dashboard-grid {
      column-gap: 4rem;
      grid-template-columns: 200px minmax(0, 1fr);
    }

    .column-center {
      width: min(100%, 640px);
    }

    .column-right {
      position: static;
      top: auto;
      order: -1;
      justify-self: stretch;
      width: 100%;
    }

    .column-left {
      justify-self: stretch;
      max-width: none;
    }
  }

  @media (max-width: 1024px) {
    .dashboard-grid {
      grid-template-columns: minmax(0, 1fr);
      column-gap: 0;
    }

    .column-left,
    .column-right {
      position: static;
      top: auto;
      justify-self: stretch;
    }

    .column-center {
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .home-shell {
      padding: 2.5rem 1.25rem 4rem;
    }

    .panel {
      padding: 1.6rem;
      border-radius: 1.4rem;
    }

    .column-center {
      width: 100%;
    }
  }
</style>
