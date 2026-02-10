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
  import EndcapCard from '$lib/components/home/EndcapCard.svelte';
  import TelemetryCapsule from '$lib/components/home/TelemetryCapsule.svelte';
  import PeopleToFollow from '$lib/components/social/PeopleToFollow.svelte';
  import MissionModal from '$lib/app/missions/MissionModal.svelte';
  import CompanionPresenceCard from '$lib/components/home/CompanionPresenceCard.svelte';
  import CompanionRitualList from '$lib/components/companions/CompanionRitualList.svelte';
  import { companionRitualsStore, applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';
  import { describeRitualCompletion } from '$lib/companions/rituals';
  import type { MissionRow as MissionRowType } from '$lib/data/missions';
  import type { FeedItem as FeedItemType } from '$lib/social/types';
  import type { QuickLink } from '$lib/components/home/types';
  import { PenSquare, MessageCircleHeart, Rss, Target, PawPrint, Compass } from 'lucide-svelte';
  import { logEvent } from '$lib/analytics';
  import { getBondBonusForLevel } from '$lib/companions/bond';
  import { computeEffectiveEnergyMax } from '$lib/player/energy';
  import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
  import { RITUALS_TOOLTIP } from '$lib/companions/companionCopy';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import { getHomeHeroCopy } from '$lib/home/homeCopy';
  import type { PageData } from './$types';

  export let data: PageData;

  const HOME_VISITS_KEY = 'looma:homeVisits';
  const WHISPER_AT_KEY = 'looma:lastWhisperAt';
  const START_HERE_DISMISSED_KEY = 'looma:homeStartHereDismissed';

  const stats = data.stats;
  const missions = data.missions ?? [];
  const creatures = data.creatures ?? [];
  const activeCompanion = data.activeCompanion ?? null;
  const endcap = data.endcap;
  const variant = data.landingVariant ?? null;
  const preferences = data.preferences ?? null;
  const wallet = data.wallet;
  const walletTx = data.walletTx ?? [];
  const latestWalletTx = walletTx[0] ?? null;
  const initialFeed: FeedItemType[] = Array.isArray(data.feed) ? data.feed : [];
  const bondGenesisEnabled = Boolean(data.flags?.bond_genesis);
  const companionCount = data.companionCount ?? 0;
  const circleUnreadCount = data.notificationsUnread ?? 0;

  let homeVisits = 99;
  let startHereDismissed = false;
  let lastWhisperAtMs: number | null = null;

  const safeInt = (value: unknown, fallback: number) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  };

  const safeMs = (value: string | null): number | null => {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };

  const activeAsInstance =
    activeCompanion
      ? ({
          id: activeCompanion.id,
          name: activeCompanion.name,
          species: activeCompanion.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          affection: activeCompanion.affection ?? 0,
          trust: activeCompanion.trust ?? 0,
          energy: activeCompanion.energy ?? 0,
          mood: activeCompanion.mood ?? 'steady',
          avatar_url: activeCompanion.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: activeCompanion.updated_at ?? new Date().toISOString(),
          stats: activeCompanion.stats ?? null
        } as any)
      : null;

  $: activeEffective = activeAsInstance ? computeCompanionEffectiveState(activeAsInstance) : null;
  $: msSinceLastWhisper = typeof lastWhisperAtMs === 'number' ? Math.max(0, Date.now() - lastWhisperAtMs) : null;
  $: showGuidance = homeVisits <= 3;
  $: showStartHere = showGuidance && !startHereDismissed;
  $: heroCopy = getHomeHeroCopy({
    companionName: activeCompanion?.name ?? null,
    effective: activeEffective,
    circleUnreadCount,
    msSinceLastWhisper
  });

  $: companionNeedsAttention =
    Boolean(activeEffective) &&
    ((activeEffective?.energy ?? 100) < 30 ||
      (typeof activeEffective?.msSinceCheckIn === 'number' && activeEffective.msSinceCheckIn > 18 * 60 * 60 * 1000));

  $: whisperNudge =
    showGuidance && typeof msSinceLastWhisper === 'number' && msSinceLastWhisper > 2 * 86_400_000;

  $: quickLinks = [
    { id: 'greeting', label: 'Resonance', description: 'Emotional compass', href: '#greeting', icon: PenSquare },
    {
      id: 'whisper',
      label: 'Whisper',
      description: 'Send a kind pulse',
      href: '#whisper',
      icon: MessageCircleHeart,
      indicator: whisperNudge ? { kind: 'gentle_nudge', label: 'Gentle nudge: send a whisper' } : null
    },
    {
      id: 'feed',
      label: 'Circle',
      description: 'Signals from friends',
      href: '#feed',
      icon: Rss,
      indicator: circleUnreadCount > 0 ? { kind: 'new_activity', label: 'New circle activity' } : null
    },
    {
      id: 'missions',
      label: 'Missions',
      description: 'Pick your next thread',
      href: '#missions',
      icon: Target
    },
    {
      id: 'companions',
      label: 'Companions',
      description: 'Check in and switch',
      href: '/app/companions',
      icon: PawPrint,
      indicator: companionNeedsAttention ? { kind: 'needs_attention', label: 'Needs attention' } : null
    },
    { id: 'path', label: 'Path', description: 'Where to wander next', href: '#path', icon: Compass }
  ] satisfies QuickLink[];

  const energyCurrent = stats?.energy ?? 0;
  const companionBonus = getBondBonusForLevel(activeCompanion?.bondLevel ?? 0);
  const energyBaseMax = stats?.energy_max ?? 0;
  const companionEnergyBonus = companionBonus.missionEnergyBonus ?? 0;
  const energyEffectiveMax = computeEffectiveEnergyMax(energyBaseMax ?? 0, companionEnergyBonus);
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
  const rituals: CompanionRitual[] = data.rituals ?? [];
  applyRitualUpdate(rituals);
  $: ritualsPendingCount = $companionRitualsStore.filter((ritual) => ritual.status !== 'completed').length;
  $: ritualsSummary =
    $companionRitualsStore.length === 0
      ? null
      : ritualsPendingCount === 0
        ? 'Daily rituals complete.'
        : `${ritualsPendingCount} daily ritual${ritualsPendingCount === 1 ? '' : 's'} left.`;

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
      display_name: typeof entry.display_name === 'string' ? entry.display_name : null,
      handle: typeof entry.handle === 'string' ? entry.handle : null,
      avatar_url: (entry.avatar_url as string | null) ?? null,
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
      ...(typeof entry.shares_count === 'number' ? { shares_count: entry.shares_count } : {})
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
    if (browser) {
      try {
        window.localStorage.setItem(WHISPER_AT_KEY, new Date().toISOString());
        lastWhisperAtMs = Date.now();
      } catch {
        // Ignore.
      }
    }
    showToast('Whisper delivered to your circle.');
  };

  const handleRitualEvent = (event: CustomEvent<{ completed: CompanionRitual[] }>) => {
    const completed = event.detail?.completed ?? [];
    const firstCompleted = completed[0];
    if (firstCompleted) {
      const copy = describeRitualCompletion(firstCompleted, activeCompanion?.name ?? null);
      showToast(copy);
    }
  };

  const handleStartMission = (event: CustomEvent<{ missionId: string | null; mode: 'resume' | 'quick' | 'retry' }>) => {
    const missionId = event.detail?.missionId ?? null;
    const mode = event.detail?.mode ?? 'quick';
    if (mode === 'quick') {
      void goto('/app/games/arpg');
      return;
    }
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
    void goto(`/app/companions?focus=${creatureId}`);
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

    logEvent('login');

    try {
      const previous = safeInt(window.localStorage.getItem(HOME_VISITS_KEY), 0);
      const next = previous + 1;
      window.localStorage.setItem(HOME_VISITS_KEY, String(next));
      homeVisits = next;
    } catch {
      homeVisits = 99;
    }

    try {
      startHereDismissed = window.localStorage.getItem(START_HERE_DISMISSED_KEY) === 'true';
    } catch {
      startHereDismissed = false;
    }

    try {
      const last = window.localStorage.getItem(WHISPER_AT_KEY);
      lastWhisperAtMs = safeMs(last);
    } catch {
      lastWhisperAtMs = null;
    }

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
      <aside class="column-left fade-up hidden md:block" data-delay="0" aria-label="Quick navigation">
        <QuickLinks links={quickLinks} />
      </aside>

      <section class="column-center">
        <article class="panel fade-up md:hidden" data-delay="0" aria-label="Whisper composer">
          <div class="panel__header panel__header--tight">
            <h2 class="panel__title panel__title--compact">Whisper</h2>
          </div>
          <QuickPostPanel
            placeholder="Whisper something kind…"
            on:posted={handleQuickPost}
            on:rituals={handleRitualEvent}
          />
        </article>

        <article id="greeting" class="panel fade-up hidden md:grid" data-delay="0" aria-label="Daily greeting">
          <div class="panel__header">
            <h2 class="panel__title">{heroCopy.headline}</h2>
            <p class="panel__subtitle">{heroCopy.subhead}</p>
          </div>
          {#if showGuidance}
            <p class="panel__body hidden md:block">{heroCopy.body}</p>
          {:else if circleUnreadCount > 0}
            <p class="panel__body panel__body--compact hidden md:block">Your circle left a signal while you were away.</p>
          {/if}
        </article>

        <CompanionPresenceCard
          className="panel fade-up"
          data-delay="0"
          companion={activeCompanion}
          showStartHint={showStartHere}
          showHelper={showGuidance}
          ritualSummary={ritualsSummary}
          ritualHref="#rituals"
        />

        <article id="whisper" class="panel fade-up hidden md:grid" data-delay="1" aria-label="Whisper composer">
          <div class="panel__header">
            <h2 class="panel__title">Whisper something kind…</h2>
            <p class="panel__subtitle">Tiny sparks keep the resonance alive.</p>
            {#if showGuidance}
              <p class="panel__helper hidden md:block">Whispers are small messages that build resonance.</p>
            {/if}
          </div>
          <QuickPostPanel
            placeholder="Whisper something kind…"
            on:posted={handleQuickPost}
            on:rituals={handleRitualEvent}
          />
        </article>

        <article id="feed" class="panel fade-up" data-delay="2" aria-label="Signals from your circle">
          <div class="panel__header">
            <h2 class="panel__title">Signals from your circle</h2>
            <p class="panel__subtitle">Respond with warmth, stay woven together.</p>
            {#if showGuidance}
              <p class="panel__helper hidden md:block">Circle signals are updates from friends.</p>
            {/if}
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
            energy={energyCurrent}
            energyMax={energyBaseMax}
            energyEffectiveMax={energyEffectiveMax}
            companionEnergyBonus={companionEnergyBonus}
            {streak}
            {petMood}
            {activeMission}
            pendingReward={false}
            recentFail={null}
            bondGenesisEnabled={bondGenesisEnabled}
            companionCount={companionCount}
            companionBonus={companionBonus}
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

        <article id="rituals" class="panel fade-up" data-delay="4" aria-label="Companion rituals">
          <div class="panel__header">
            <div class="panel__title-row">
              <h2 class="panel__title">Daily rituals</h2>
              <InfoTooltip text={RITUALS_TOOLTIP} label="How rituals work" />
            </div>
            <p class="panel__subtitle">Little loops that keep your bond humming.</p>
          </div>
          {#if activeCompanion}
            <CompanionRitualList rituals={$companionRitualsStore} emptyCopy="Complete a ritual together." />
          {:else}
            <p class="text-sm text-white/60">Pick an active companion to start daily rituals.</p>
          {/if}
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

  .panel__helper {
    margin: 0.35rem 0 0;
    font-size: 0.88rem;
    color: rgba(226, 232, 255, 0.68);
  }

  .panel__body--compact {
    max-width: 58ch;
  }

  .home-shell {
    position: relative;
    z-index: 10;
    min-height: 100vh;
    width: 100%;
    max-width: 1560px;
    box-sizing: border-box;
    --home-pad-top: clamp(2.5rem, 4vw, 4rem);
    --home-pad-x: clamp(1.5rem, 3.5vw, 2.75rem);
    --home-pad-bottom: 5.5rem;
    /* Bias the layout left a bit to make room for the companion dock on the right. */
    --home-pad-right-extra: 3.25rem;
    padding: var(--home-pad-top) calc(var(--home-pad-x) + var(--home-pad-right-extra)) var(--home-pad-bottom)
      var(--home-pad-x);
    margin: 0 auto;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 220px minmax(0, 700px) 280px;
    grid-template-areas: 'left center right';
    column-gap: clamp(0.85rem, 1.8vw, 1.4rem);
    row-gap: 1.5rem;
    align-items: start;
    justify-content: center;
  }

  .column-left,
  .column-right {
    grid-area: left;
    display: grid;
    gap: 1.5rem;
    position: sticky;
    top: clamp(5rem, 10vw, 6.5rem);
    align-self: start;
    justify-self: stretch;
  }

  .column-right {
    grid-area: right;
  }

  .column-center {
    grid-area: center;
    min-width: 0;
  }

  /* Keep desktop proportions: collapse to 2 columns on medium widths. */
  @media (max-width: 1320px) {
    .home-shell {
      max-width: 1160px;
      --home-pad-right-extra: 2.25rem;
    }

    .dashboard-grid {
      grid-template-columns: 220px minmax(0, 680px);
      grid-template-areas: 'left center';
    }

    .column-right {
      display: none;
    }
  }

  /* Mid-sized desktop: stack quick links under the main column (prevents cramped/zoomed feel). */
  @media (max-width: 1180px) {
    .home-shell {
      --home-pad-right-extra: 1.25rem;
    }

    .dashboard-grid {
      grid-template-columns: minmax(0, 720px);
      grid-template-areas:
        'center'
        'left';
      justify-content: start;
    }

    .column-left {
      position: static;
      top: auto;
      max-width: none;
    }
  }

  /* Tablet/mobile: single centered column, tighter padding, no sticky side panels. */
  @media (max-width: 980px) {
    .home-shell {
      --home-pad-top: 1.6rem;
      --home-pad-x: 1.25rem;
      --home-pad-bottom: 5.5rem;
      --home-pad-right-extra: 0px;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
      grid-template-areas:
        'center'
        'left';
      justify-content: stretch;
    }

    .column-left {
      position: static;
      top: auto;
    }
  }

  /* Mobile: hide quick navigation panel entirely (prevents "Stay tethered" from reflowing below the feed). */
  @media (max-width: 767px) {
    .column-left {
      display: none;
    }
  }

  @media (max-width: 720px) {
    .home-shell {
      --home-pad-top: 1.25rem;
      --home-pad-x: 1rem;
      --home-pad-bottom: 5.5rem;
      --home-pad-right-extra: 0px;
    }
  }

  .column-left {
    width: 100%;
    max-width: 220px;
  }

  .column-right {
    justify-self: stretch;
    width: 100%;
    max-width: 280px;
  }

  .column-center {
    display: grid;
    gap: 1.5rem;
    width: 100%;
    max-width: 700px;
    min-width: 0;
  }

  .panel {
    --panel-gap: 1.5rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.2rem);
    border-radius: 1.75rem;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 32px 64px rgba(8, 15, 30, 0.45);
    backdrop-filter: blur(18px);
  }

  .panel > :global(* + *) {
    margin-top: var(--panel-gap);
  }

  .panel__header {
    display: grid;
    gap: 0.35rem;
  }

  .panel__header--tight {
    gap: 0;
  }

  .panel__title-row {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
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

  @media (max-width: 1480px) {
    .dashboard-grid {
      grid-template-columns: 210px minmax(0, 660px) 260px;
      column-gap: 1rem;
    }
  }

  @media (max-width: 1280px) {
    .dashboard-grid {
      column-gap: 1.25rem;
      grid-template-columns: 210px minmax(0, 700px);
      justify-content: center;
    }

    .column-right {
      position: static;
      top: auto;
      justify-self: stretch;
      max-width: none;
      width: 100%;
      grid-column: 1 / -1;
    }

    .column-left {
      justify-self: stretch;
      max-width: 220px;
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
    .column-center {
      gap: 1rem;
    }

    .panel {
      --panel-gap: 1rem;
      padding: 1.1rem 1rem;
      border-radius: 1.25rem;
      box-shadow: 0 18px 38px rgba(8, 15, 30, 0.38);
      backdrop-filter: none;
    }

    .panel__title {
      font-size: 1.1rem;
    }

    .panel__title--compact {
      font-size: 1.05rem;
    }

    .panel__subtitle {
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      text-transform: none;
    }

    .column-center {
      width: 100%;
    }
  }

  /* Mobile browsers can drop composited layers while scrolling when elements animate from opacity:0.
     Disable the initial fade-in on small screens to avoid “disappearing sections” flicker. */
  @media (max-width: 767px) {
    .fade-up {
      opacity: 1;
      transform: none;
      animation: none;
    }
  }
</style>
