<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import HomeResonanceLens from '$lib/components/home/HomeResonanceLens.svelte';
  import HomeSecondaryStack from '$lib/components/home/HomeSecondaryStack.svelte';
  import type { HomeMood, HomePrimaryIntent } from '$lib/components/home/homeLoopTypes';
  import { logEvent } from '$lib/analytics';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import type { FeedItem } from '$lib/social/types';
  import type { PageData } from './$types';

  export let data: PageData;

  const COACH_SEEN_KEY = 'looma:homeCoachSeenV2';
  const HOME_VISIT_KEY = 'looma:homeVisitCountV2';
  const LOCAL_CHECKIN_KEY = 'looma:dailyMoodCheckin';

  const moodCopy: Record<HomeMood, string> = {
    calm: 'You arrived steady. We can keep this gentle.',
    heavy: 'You are carrying a lot. We will keep this small and kind.',
    curious: 'Curiosity is here. Let us follow one thread together.',
    energized: 'You brought energy. Let us direct it into one intentional move.',
    numb: 'Numb is still an arrival. We can start with one simple step.'
  };

  const activeCompanion = data.activeCompanion ?? null;
  const initialFeed = (Array.isArray(data.feed) ? data.feed : []) as FeedItem[];
  const quickMission = data.dailyMissions?.[0] ?? data.weeklyMissions?.[0] ?? data.missions?.[0] ?? null;

  const localDateKey = () => {
    const now = new Date();
    const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  };

  const safeParse = (value: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value) as { date?: string; mood?: HomeMood };
    } catch {
      return null;
    }
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

  $: effective = activeAsInstance ? computeCompanionEffectiveState(activeAsInstance) : null;
  $: companionIsDistant = effective?.moodKey === 'distant';
  $: companionStatusLabel = companionIsDistant ? 'Distant' : effective?.moodLabel ?? 'Steady';
  $: companionStatusText = !activeCompanion
    ? 'Choose your companion to start your daily connection loop.'
    : companionIsDistant
      ? `${activeCompanion.name} misses you. Reconnect.`
      : 'Your bond is responsive and ready for a quick check-in.';

  let selectedMood: HomeMood | null =
    (typeof data.dailyCheckinToday?.mood === 'string' ? (data.dailyCheckinToday.mood as HomeMood) : null) ?? null;
  let hasCheckedInToday = Boolean(data.dailyCheckinToday);
  let submittingMood = false;
  let rewardToast: string | null = null;
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;
  let coachStep = 0;
  let showCoach = false;
  let upcomingLabel = 'No events scheduled this week.';
  let arrivalSection: HTMLElement | null = null;
  let desktopWide = false;
  let desktopMediaQuery: MediaQueryList | null = null;
  let handleDesktopChange: ((event: MediaQueryListEvent) => void) | null = null;

  $: attunementLine = selectedMood ? moodCopy[selectedMood] ?? null : null;

  $: homeIntent = (() => {
    if (!hasCheckedInToday) return 'check_in' as HomePrimaryIntent;
    if (companionIsDistant || (effective?.energy ?? activeCompanion?.energy ?? 100) < 30) return 'reconnect';
    if ((data.notificationsUnread ?? 0) > 0) return 'send_warmth';
    return 'quick_spark';
  })();

  $: primaryCopy =
    homeIntent === 'check_in'
      ? { label: 'Check in (1 tap)', helper: 'Start by naming your arrival mood.' }
      : homeIntent === 'reconnect'
        ? { label: 'Reconnect (30 sec)', helper: 'Your companion needs a gentle check-in.' }
        : homeIntent === 'send_warmth'
          ? { label: 'Send warmth', helper: 'Respond to one signal from your circle.' }
          : { label: 'Quick Spark (60 sec)', helper: 'Run a short ritual to keep momentum.' };

  const track = (kind: 'home_view' | 'mood_checkin_submit' | 'primary_action_click', meta: Record<string, unknown> = {}) => {
    console.debug('[home]', kind, meta);
    void logEvent(kind, meta);
  };

  const dismissCoach = () => {
    showCoach = false;
    if (!browser) return;
    window.localStorage.setItem(COACH_SEEN_KEY, 'true');
  };

  const submitMood = async (mood: HomeMood) => {
    if (submittingMood || hasCheckedInToday) return;
    selectedMood = mood;
    submittingMood = true;

    const today = localDateKey();

    try {
      const response = await fetch('/api/home/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mood, date: today })
      });

      if (!response.ok) {
        throw new Error('checkin_failed');
      }

      hasCheckedInToday = true;
      if (browser) {
        window.localStorage.setItem(LOCAL_CHECKIN_KEY, JSON.stringify({ date: today, mood }));
      }
    } catch {
      // Local fallback for offline/transient DB failures.
      hasCheckedInToday = true;
      if (browser) {
        window.localStorage.setItem(LOCAL_CHECKIN_KEY, JSON.stringify({ date: today, mood }));
      }
    } finally {
      submittingMood = false;
      track('mood_checkin_submit', { mood });
      dismissCoach();
    }
  };

  const triggerRewardToast = () => {
    rewardToast = '+12 XP · +4 Energy';
    if (rewardTimer) clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => {
      rewardToast = null;
      rewardTimer = null;
    }, 2400);
  };

  const handlePrimaryAction = async () => {
    track('primary_action_click', { intent: homeIntent, mood: selectedMood });

    if (homeIntent === 'check_in') {
      arrivalSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    triggerRewardToast();

    if (homeIntent === 'reconnect') {
      await goto('/app/companions');
      return;
    }
    if (homeIntent === 'send_warmth') {
      await goto('/app/circles');
      return;
    }

    await goto('/app/games/arpg');
  };

  onMount(() => {
    track('home_view', {
      hasMood: hasCheckedInToday,
      companion: activeCompanion?.id ?? null
    });

    const run = async () => {
      if (browser) {
        desktopMediaQuery = window.matchMedia('(min-width: 1100px)');
        desktopWide = desktopMediaQuery.matches;
        handleDesktopChange = (event: MediaQueryListEvent) => {
          desktopWide = event.matches;
        };
        desktopMediaQuery.addEventListener('change', handleDesktopChange);

        const visits = Number(window.localStorage.getItem(HOME_VISIT_KEY) ?? '0') + 1;
        window.localStorage.setItem(HOME_VISIT_KEY, String(visits));

        const localCheckin = safeParse(window.localStorage.getItem(LOCAL_CHECKIN_KEY));
        if (!hasCheckedInToday && localCheckin?.date === localDateKey() && localCheckin.mood) {
          selectedMood = localCheckin.mood;
          hasCheckedInToday = true;
        }

        const coachSeen = window.localStorage.getItem(COACH_SEEN_KEY) === 'true';
        showCoach = visits <= 1 && !coachSeen && !hasCheckedInToday;
      }

      try {
        const syncRes = await fetch(`/api/home/checkin?date=${encodeURIComponent(localDateKey())}`, {
          headers: { 'cache-control': 'no-store' }
        });
        const payload = await syncRes.json().catch(() => ({}));
        if (syncRes.ok && payload?.today?.mood) {
          selectedMood = payload.today.mood as HomeMood;
          hasCheckedInToday = true;
        }
      } catch {
        // Keep local state when sync fails.
      }

      try {
        const upcomingRes = await fetch('/api/events/upcoming?days=7', { headers: { 'cache-control': 'no-store' } });
        const payload = await upcomingRes.json().catch(() => ({}));
        const first = Array.isArray(payload?.items) ? payload.items[0] : null;
        if (first?.title && first?.startsAt) {
          upcomingLabel = `${first.title} · ${new Date(first.startsAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
          })}`;
        }
      } catch {
        // keep default label
      }
    };

    void run();

    return () => {
      if (rewardTimer) clearTimeout(rewardTimer);
      if (desktopMediaQuery && handleDesktopChange) {
        desktopMediaQuery.removeEventListener('change', handleDesktopChange);
      }
    };
  });
</script>

<div class="home-root bg-neuro">
  <BackgroundStack />

  <main class="home-shell" aria-labelledby="home-title">
    <h1 id="home-title" class="sr-only">Looma Home</h1>

    <section class="loop" bind:this={arrivalSection}>
      <HomeResonanceLens
        {selectedMood}
        {hasCheckedInToday}
        attunementLine={attunementLine ?? null}
        companionName={activeCompanion?.name ?? null}
        companionStatusLabel={companionStatusLabel}
        companionStatusText={companionStatusText}
        primaryLabel={primaryCopy.label}
        primaryHelper={primaryCopy.helper}
        signalsCount={data.notificationsUnread ?? 0}
        on:moodcommit={(event) => submitMood(event.detail.mood)}
        on:primary={handlePrimaryAction}
      />
    </section>

    <div class="slot slot--secondary">
      <HomeSecondaryStack
        feedPreview={initialFeed[0] ?? null}
        signalsHref="/app/circles"
        {upcomingLabel}
        upcomingHref="/app/events"
        quickMissionTitle={quickMission?.title ?? null}
        quickMissionSummary={quickMission?.summary ?? null}
        quickMissionHref="/app/games/arpg"
        alwaysExpanded={desktopWide}
      />
    </div>

    {#if rewardToast}
      <div class="reward-toast" role="status">{rewardToast}</div>
    {/if}
  </main>

  {#if showCoach}
    <div class="coach" aria-label="Home guide">
      <div class="coach__panel">
        <p class="coach__step">Step {coachStep + 1} of 3</p>
        {#if coachStep === 0}
          <p>This is your companion. Keep your bond humming.</p>
        {:else if coachStep === 1}
          <p>Tap a mood to check in. It takes one second.</p>
        {:else}
          <p>Do this next. One small action is enough.</p>
        {/if}
        <div class="coach__actions">
          <button type="button" on:click={dismissCoach}>Skip</button>
          {#if coachStep < 2}
            <button type="button" on:click={() => (coachStep += 1)}>Next</button>
          {:else}
            <button type="button" on:click={dismissCoach}>Done</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
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
    min-height: 100vh;
    position: relative;
  }

  .home-shell {
    position: relative;
    z-index: 5;
    margin: 0 auto;
    width: 100%;
    max-width: 36rem;
    box-sizing: border-box;
    padding: 1rem 0.9rem calc(6.4rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.95rem;
  }

  .loop {
    display: grid;
    gap: 0.75rem;
    position: relative;
  }

  .slot {
    min-width: 0;
  }

  .reward-toast {
    position: fixed;
    left: 50%;
    bottom: calc(5.2rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.4);
    background: rgba(15, 118, 110, 0.92);
    color: rgba(236, 253, 245, 0.98);
    padding: 0.55rem 1rem;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 16px 30px rgba(20, 184, 166, 0.24);
  }

  .coach {
    position: fixed;
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    z-index: 30;
  }

  .coach__panel {
    border-radius: 1rem;
    border: 1px solid rgba(125, 211, 252, 0.42);
    background: linear-gradient(160deg, rgba(6, 25, 47, 0.95), rgba(12, 42, 68, 0.94));
    padding: 0.85rem;
    color: rgba(226, 232, 240, 0.96);
    box-shadow: 0 24px 40px rgba(8, 15, 30, 0.4);
  }

  .coach__step {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(125, 211, 252, 0.95);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .coach__panel p {
    margin: 0.45rem 0 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .coach__actions {
    margin-top: 0.75rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .coach__actions button {
    min-height: 2.2rem;
    border-radius: 0.72rem;
    padding: 0 0.8rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.72);
    color: rgba(248, 250, 252, 0.98);
    font-size: 0.83rem;
    font-weight: 600;
  }

  @media (min-width: 768px) {
    .home-shell {
      padding-top: 1.25rem;
    }
  }

  @media (min-width: 1100px) {
    .home-shell {
      max-width: 74rem;
      padding: 1.6rem 1.5rem 3.2rem;
      gap: 1.2rem;
    }

    .loop {
      gap: 1rem;
    }

    .slot--secondary :global(.secondary.card) {
      border-radius: 1.2rem;
      border: 1px solid rgba(148, 163, 184, 0.22);
      background: rgba(2, 8, 23, 0.56);
      padding: 1rem;
    }

    .slot--secondary :global(.secondary__stack) {
      margin-top: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .slot--secondary :global(.mini) {
      min-height: 100%;
    }
  }
</style>
