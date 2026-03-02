<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import HomeSanctuaryV1 from '$lib/components/home/HomeSanctuaryV1.svelte';
  import HomeSecondaryStack from '$lib/components/home/HomeSecondaryStack.svelte';
  import CompanionSheet from '$lib/components/home/CompanionSheet.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { logEvent } from '$lib/analytics';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';
  import type { PageData } from './$types';

  type HomeMood = 'calm' | 'heavy' | 'curious' | 'energized' | 'numb';
  type CompanionEraTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

  export let data: PageData;

  const activeCompanion = data.activeCompanion ?? null;
  let companionState = activeCompanion ? { ...activeCompanion } : null;
  let dailyCheckinToday = data.dailyCheckinToday ?? null;
  let latestDailyCheckin = data.latestDailyCheckin ?? null;
  let companionReply: string | null = null;
  let companionReplyDebug: string | null = null;

  $: activeAsInstance =
    companionState
      ? ({
          id: companionState.id,
          name: companionState.name,
          species: companionState.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          affection: companionState.affection ?? 0,
          trust: companionState.trust ?? 0,
          energy: companionState.energy ?? 0,
          mood: companionState.mood ?? 'steady',
          avatar_url: companionState.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: companionState.updated_at ?? new Date().toISOString(),
          stats: companionState.stats ?? null
        } as any)
      : null;

  $: effective = activeAsInstance ? computeCompanionEffectiveState(activeAsInstance) : null;
  $: museAnimation = pickMuseAnimationForMood(effective?.moodKey, { nowMs: nowTick, seed: companionState?.id ?? '' });

  const deriveClosenessState = () => {
    if (!companionState) return 'Near' as const;
    if (effective?.moodKey === 'distant') return 'Distant' as const;
    if (effective?.moodKey === 'radiant') return 'Resonant' as const;
    return 'Near' as const;
  };

  $: closenessState = deriveClosenessState();
  $: companionName = companionState?.name ?? 'Mirae';
  $: primaryLabel = `Check in with ${companionName}`;
  $: primaryCopy = `Share how you feel, hear ${companionName}'s response, and strengthen your bond.`;
  $: primaryMission = data.missions?.[0] ?? null;
  $: journalHref = companionState?.id ? `/app/memory?companion=${companionState.id}` : '/app/memory';
  $: companionEraTitle =
    data.weeklyArc?.emphasis === 'care'
      ? 'Era of Steady Return'
      : data.weeklyArc?.emphasis === 'social'
        ? 'Era of Shared Thread'
        : data.weeklyArc?.emphasis === 'mission'
          ? 'Era of Wayfinding'
          : data.weeklyArc?.emphasis === 'play'
            ? 'Era of Bright Play'
            : data.keepsakeTheme?.tone === 'bond'
              ? 'Era of Deep Bond'
              : 'Era of Gathering Quiet';
  $: companionEraBody =
    data.weeklyArc?.body ??
    (data.keepsakeTheme?.title
      ? `${data.keepsakeTheme.title} is currently shaping how ${companionName} reads the relationship.`
      : `${companionName} is still gathering enough recent moments for the next clearer phase to emerge.`);
  $: companionEraTone = (() => {
    if (
      data.keepsakeTheme?.tone === 'care' ||
      data.keepsakeTheme?.tone === 'social' ||
      data.keepsakeTheme?.tone === 'mission' ||
      data.keepsakeTheme?.tone === 'play' ||
      data.keepsakeTheme?.tone === 'bond'
    ) {
      return data.keepsakeTheme.tone;
    }
    if (
      data.weeklyArc?.emphasis === 'care' ||
      data.weeklyArc?.emphasis === 'social' ||
      data.weeklyArc?.emphasis === 'mission' ||
      data.weeklyArc?.emphasis === 'play'
    ) {
      return data.weeklyArc.emphasis;
    }
    return 'quiet';
  })() as CompanionEraTone;
  $: subscriptionActive = Boolean(data.subscription?.active);
  $: premiumStyle = data.premiumSanctuaryStyle ?? null;
  $: premiumAccentLabel =
    premiumStyle === 'gilded_dawn'
      ? 'Gilded Dawn is warming the sanctuary.'
      : premiumStyle === 'moon_glass'
        ? 'Moon Glass is softening the sanctuary light.'
        : premiumStyle === 'ember_bloom'
          ? 'Ember Bloom is drawing the sanctuary inward.'
          : premiumStyle === 'tide_silk'
            ? 'Tide Silk is making the sanctuary feel fluid and airy.'
            : data.keepsakeTheme?.title
              ? `${data.keepsakeTheme.title} is deepening the sanctuary atmosphere.`
              : `${companionName}'s sanctuary is carrying a richer premium glow.`;
  $: statusLine =
    closenessState === 'Distant'
      ? `${companionName} feels distant.`
      : closenessState === 'Resonant'
        ? `${companionName} feels deeply connected.`
        : `${companionName} is near.`;

  const isSameLocalDay = (dateA: Date, dateB: Date) =>
    dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();

  $: latestCheckinDate = latestDailyCheckin?.created_at ? new Date(latestDailyCheckin.created_at) : null;
  $: checkinByDateField = Boolean(dailyCheckinToday);
  $: checkinByTimestamp =
    latestCheckinDate instanceof Date && !Number.isNaN(latestCheckinDate.getTime())
      ? isSameLocalDay(latestCheckinDate, new Date())
      : false;
  $: hasRecentCheckin = checkinByDateField || checkinByTimestamp;

  $: statusReason =
    !hasRecentCheckin
      ? `${companionName} hasn't heard from you today.`
      : (effective?.energy ?? companionState?.energy ?? 0) < 35
        ? `${companionName} feels a little low-energy right now. Stay nearby.`
        : (data.notificationsUnread ?? 0) > 0
          ? 'You have new moments waiting together.'
          : `${companionName} heard from you recently and feels closer.`;

  $: needsReconnectToday = closenessState === 'Distant' || !hasRecentCheckin;

  let companionSheetOpen = false;
  let checkinModalOpen = false;
  let chapterRevealOpen = false;
  let rewardToast: string | null = null;
  let checkinError: string | null = null;
  let checkinLoading = false;
  let selectedMood: HomeMood = 'calm';
  let reflectionText = '';
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  let animationTickTimer: ReturnType<typeof setInterval> | null = null;
  let modelActivity: 'idle' | 'attending' | 'composing' | 'responding' = 'idle';
  let nowTick = Date.now();
  let chapterRevealSeenId = '';

  const track = (
    kind: 'home_view' | 'primary_action_click' | 'orb_open_sheet' | 'checkin_submit' | 'checkin_success' | 'checkin_error',
    meta: Record<string, unknown> = {}
  ) => {
    console.debug('[home]', kind, meta);
    void logEvent(kind, meta);
  };

  const showReward = (copy: string) => {
    rewardToast = copy;
    if (rewardTimer) clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => {
      rewardToast = null;
      rewardTimer = null;
    }, 2600);
  };

  const handlePrimaryReconnect = () => {
    track('primary_action_click', { intent: 'CHECKIN_REFLECT' });
    checkinModalOpen = true;
    checkinError = null;
    modelActivity = 'composing';
  };

  const closeCheckinModal = () => {
    if (checkinLoading) return;
    checkinModalOpen = false;
    checkinError = null;
    modelActivity = 'idle';
  };

  const submitCheckin = async () => {
    if (!companionState?.id) {
      checkinError = 'No active companion selected.';
      return;
    }
    const reflection = reflectionText.trim();
    if (reflection.length < 3) {
      checkinError = 'Write at least a few words so Mirae can respond meaningfully.';
      return;
    }

    checkinLoading = true;
    checkinError = null;
    modelActivity = 'responding';
    track('checkin_submit', { mood: selectedMood, reflectionChars: reflection.length });

    try {
      const response = await fetch('/api/home/reconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companionId: companionState.id,
          mood: selectedMood,
          reflection
        })
      });

      const payload = (await response.json().catch(() => null)) as {
        checkin?: { id: string; mood: HomeMood; checkin_date: string; created_at: string } | null;
        checkInAt?: string;
        companion?: {
          id: string;
          trust: number;
          affection: number;
          energy: number;
          mood: string;
          updated_at: string;
        } | null;
        deltas?: { trust?: number; affection?: number; energy?: number } | null;
        reaction?: { text?: string } | null;
        debug?: { responseSource?: string; responseNote?: string | null; traceId?: string | null } | null;
        message?: string;
      } | null;

      if (!response.ok) {
        checkinError = payload?.message ?? 'Could not complete check-in right now.';
        track('checkin_error', { status: response.status, mood: selectedMood });
        modelActivity = 'composing';
        return;
      }

      if (payload?.checkin) {
        dailyCheckinToday = payload.checkin;
        latestDailyCheckin = payload.checkin;
      }
      if (payload?.companion && companionState) {
        const existingStats = companionState.stats;
        const statsObj = Array.isArray(existingStats) ? (existingStats[0] ?? {}) : (existingStats ?? {});
        const nextStats = {
          ...statsObj,
          played_at: payload.checkInAt ?? new Date().toISOString(),
          last_passive_tick: payload.checkInAt ?? new Date().toISOString()
        };

        companionState = {
          ...companionState,
          trust: payload.companion.trust,
          affection: payload.companion.affection,
          energy: payload.companion.energy,
          mood: payload.companion.mood,
          updated_at: payload.companion.updated_at,
          stats: Array.isArray(existingStats) ? [nextStats] : nextStats
        };
      }

      const defaultReply = `Thank you for sharing that. I'm here with you.`;
      companionReply =
        typeof payload?.reaction?.text === 'string' && payload.reaction.text.trim().length > 0
          ? payload.reaction.text.trim()
          : defaultReply;
      if (payload?.debug?.responseSource) {
        companionReplyDebug = `source: ${payload.debug.responseSource}${payload.debug.responseNote ? ` · ${payload.debug.responseNote}` : ''}`;
      } else {
        companionReplyDebug = 'source: unknown';
      }

      const deltaEnergy = payload?.deltas?.energy ?? 0;
      const deltaTrust = payload?.deltas?.trust ?? 0;
      showReward(`You're connected. +${Math.max(0, deltaEnergy)} Energy · +${Math.max(0, deltaTrust)} Trust`);

      reflectionText = '';
      checkinModalOpen = false;
      track('checkin_success', { mood: selectedMood, deltaEnergy, deltaTrust });

      if (responseTimer) clearTimeout(responseTimer);
      responseTimer = setTimeout(() => {
        modelActivity = 'attending';
      }, 2200);
    } catch (error) {
      checkinError = 'Network issue while saving your check-in.';
      track('checkin_error', { mood: selectedMood, message: error instanceof Error ? error.message : String(error) });
      modelActivity = 'composing';
    } finally {
      checkinLoading = false;
    }
  };

  onMount(() => {
    track('home_view', {
      companion: companionState?.id ?? null,
      closenessState,
      hasMood: Boolean(dailyCheckinToday)
    });

    animationTickTimer = setInterval(() => {
      nowTick = Date.now();
    }, 30_000);

    return () => {
      if (rewardTimer) clearTimeout(rewardTimer);
      if (responseTimer) clearTimeout(responseTimer);
      if (animationTickTimer) clearInterval(animationTickTimer);
    };
  });

  $: currentChapterReveal = data.chapterReveal ?? null;
  $: if (browser) {
    const revealId = currentChapterReveal?.id ?? '';
    if (!revealId) {
      chapterRevealSeenId = '';
      chapterRevealOpen = false;
    } else if (revealId !== chapterRevealSeenId) {
      chapterRevealSeenId = revealId;
      const seen = window.localStorage.getItem(`looma:chapterRevealSceneSeen:${revealId}`) === 'true';
      chapterRevealOpen = !seen;
    }
  }

  const closeChapterReveal = () => {
    chapterRevealOpen = false;
    if (!browser || !currentChapterReveal?.id) return;
    window.localStorage.setItem(`looma:chapterRevealSceneSeen:${currentChapterReveal.id}`, 'true');
  };
</script>

<div class="home-root">
  <main class="home-shell" aria-labelledby="home-title">
    <h1 id="home-title" class="sr-only">Companion Home</h1>

    <HomeSanctuaryV1
      companionName={companionName}
      companionAvatarUrl={companionState?.avatar_url ?? null}
      keepsakeTheme={data.keepsakeTheme ?? null}
      {subscriptionActive}
      premiumAccentLabel={premiumAccentLabel}
      premiumStyle={premiumStyle}
      {closenessState}
      {statusLine}
      {statusReason}
      {needsReconnectToday}
      {primaryLabel}
      {primaryCopy}
      {companionReply}
      {companionReplyDebug}
      {modelActivity}
      modelAnimation={museAnimation}
      on:primary={handlePrimaryReconnect}
      on:companion={() => {
        companionSheetOpen = true;
        modelActivity = 'attending';
        track('orb_open_sheet', { companion: companionState?.id ?? null });
      }}
    />

    {#if rewardToast}
      <div class="reward-toast" role="status">{rewardToast}</div>
    {/if}
  </main>

  <section class="home-secondary" aria-label="Sanctuary shortcuts">
    <HomeSecondaryStack
      feedPreview={data.feed?.[0] ?? null}
      {journalHref}
      journalSummary={data.memorySummary?.summary_text ?? null}
      journalUpdatedAt={data.memorySummary?.last_built_at ?? null}
      chapterReveal={data.chapterReveal ?? null}
      missionTitle={primaryMission?.title ?? null}
      missionSummary={primaryMission?.summary ?? null}
      missionHref={primaryMission?.id ? `/app/missions/${primaryMission.id}` : '/app/missions'}
      messagesHref="/app/messages"
      circlesHref="/app/circles"
      notificationsUnread={data.notificationsUnread ?? 0}
      companionHref="/app/companions"
      {companionName}
      needsCheckin={needsReconnectToday}
      rituals={data.rituals ?? []}
      hasDailyCheckin={hasRecentCheckin}
      journalMoments={data.journalMoments ?? []}
      sanctuaryNudge={data.sanctuaryNudge ?? null}
      dailyArc={data.dailyArc ?? null}
      dailyArcRecap={data.dailyArcRecap ?? null}
      weeklyArc={data.weeklyArc ?? null}
      chapterMilestones={data.chapterMilestones ?? []}
      chapterRewards={data.chapterRewards ?? []}
      sanctuaryShelfRewards={data.sanctuaryShelfRewards ?? []}
      eraAction={data.eraAction ?? null}
      chapterPaths={data.chapterPaths ?? []}
      momentum={data.momentum ?? null}
      {premiumStyle}
    />
  </section>
</div>

<CompanionSheet
  open={companionSheetOpen}
  companionId={companionState?.id ?? null}
  name={companionState?.name ?? null}
  status={closenessState === 'Near' ? 'Synced' : closenessState}
  bondTier={`Bond Tier ${companionState?.bondLevel ?? 1}`}
  evolutionTag={companionState?.species ? `${companionState.species} form` : 'Base form'}
  imageUrl={companionState?.avatar_url ?? null}
  energy={effective?.energy ?? companionState?.energy ?? 0}
  eraTitle={companionEraTitle}
  eraBody={companionEraBody}
  eraTone={companionEraTone}
  onClose={() => {
    companionSheetOpen = false;
    modelActivity = 'idle';
  }}
/>

<BottomSheet open={checkinModalOpen} title="Check in with Mirae" onClose={closeCheckinModal}>
  <section class="checkin-sheet">
    <p class="checkin-sheet__copy">How are you feeling right now?</p>

    <div class="mood-row" role="radiogroup" aria-label="Mood">
      {#each ['calm', 'heavy', 'curious', 'energized', 'numb'] as mood}
        <button
          type="button"
          class={`mood-pill ${selectedMood === mood ? 'mood-pill--active' : ''}`}
          role="radio"
          aria-checked={selectedMood === mood}
          on:click={() => {
            selectedMood = mood as HomeMood;
            modelActivity = 'composing';
          }}
        >
          {mood}
        </button>
      {/each}
    </div>

    <label class="reflect-label" for="reflect-input">Tell her what this moment feels like.</label>
    <textarea
      id="reflect-input"
      class="reflect-input"
      rows="4"
      maxlength="480"
      bind:value={reflectionText}
      placeholder="I feel..."
      on:focus={() => {
        modelActivity = 'composing';
      }}
      on:input={() => {
        modelActivity = 'composing';
      }}
    ></textarea>

    <p class="char-count">{reflectionText.trim().length}/480</p>

    {#if checkinError}
      <p class="checkin-error" role="alert">{checkinError}</p>
    {/if}

    <button type="button" class="submit-checkin" disabled={checkinLoading} on:click={submitCheckin}>
      {checkinLoading ? 'Listening...' : 'Share with Mirae'}
    </button>
  </section>
</BottomSheet>

<BottomSheet open={chapterRevealOpen} title="Chapter opened" onClose={closeChapterReveal}>
  {#if currentChapterReveal}
    <section class={`chapter-sheet chapter-sheet--${currentChapterReveal.tone ?? 'bond'}`}>
      <div class="chapter-sheet__halo" aria-hidden="true"></div>
      <p class="chapter-sheet__eyebrow">Companion reveal</p>
      <h3>{currentChapterReveal.title}</h3>
      {#if currentChapterReveal.rewardTitle}
        <div class="chapter-sheet__keepsake">
          <span>Keepsake</span>
          <strong>{currentChapterReveal.rewardTitle}</strong>
        </div>
      {/if}
      <p class="chapter-sheet__body">{currentChapterReveal.body}</p>
      <div class="chapter-sheet__actions">
        <a class="chapter-sheet__action chapter-sheet__action--primary" href={currentChapterReveal.href} on:click={closeChapterReveal}>
          Open journal
        </a>
        <a class="chapter-sheet__action" href="/app/companions" on:click={closeChapterReveal}>
          Visit companion
        </a>
      </div>
    </section>
  {/if}
</BottomSheet>

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
    --home-font-display: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    --home-font-body: 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif;

    --home-text-secondary: rgba(189, 208, 232, 0.88);
    --home-cta-start: rgba(86, 232, 220, 0.96);
    --home-cta-end: rgba(119, 175, 255, 0.95);
    --home-cta-text: rgba(6, 16, 35, 0.96);
    --home-radius-lg: 0.95rem;
    --home-shadow-soft: 0 14px 28px rgba(20, 184, 166, 0.3);

    min-height: 100vh;
    position: relative;
    overflow: clip;
    font-family: var(--home-font-body);
  }

  .home-shell {
    position: relative;
    z-index: 5;
    margin: 0;
    width: 100%;
    max-width: none;
    box-sizing: border-box;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .reward-toast {
    position: fixed;
    left: 50%;
    bottom: calc(5.4rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.44);
    background: rgba(13, 148, 136, 0.95);
    color: rgba(240, 253, 250, 0.96);
    padding: 0.48rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 700;
    box-shadow: var(--home-shadow-soft);
  }

  .home-secondary {
    position: relative;
    z-index: 6;
    padding: 0.95rem 0.95rem calc(7rem + env(safe-area-inset-bottom));
  }

  .checkin-sheet {
    display: grid;
    gap: 0.72rem;
  }

  .checkin-sheet__copy {
    margin: 0;
    color: var(--home-text-secondary);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .mood-row {
    display: flex;
    gap: 0.42rem;
    flex-wrap: wrap;
  }

  .mood-pill {
    min-height: 2rem;
    border-radius: 999px;
    border: 1px solid rgba(173, 192, 222, 0.38);
    background: rgba(15, 22, 46, 0.55);
    color: rgba(228, 236, 247, 0.9);
    text-transform: capitalize;
    font-size: 0.76rem;
    padding: 0 0.72rem;
  }

  .mood-pill--active {
    border-color: rgba(148, 248, 225, 0.8);
    background: rgba(19, 65, 90, 0.6);
    color: rgba(228, 255, 248, 0.98);
  }

  .reflect-label {
    font-size: 0.76rem;
    letter-spacing: 0.03em;
    color: rgba(215, 228, 245, 0.84);
  }

  .reflect-input {
    width: 100%;
    box-sizing: border-box;
    border-radius: 0.95rem;
    border: 1px solid rgba(161, 185, 218, 0.4);
    background: rgba(10, 18, 40, 0.62);
    color: rgba(241, 246, 253, 0.94);
    padding: 0.7rem 0.78rem;
    resize: vertical;
    font: inherit;
  }

  .reflect-input:focus-visible {
    outline: 2px solid rgba(133, 212, 255, 0.8);
    outline-offset: 2px;
  }

  .char-count {
    margin: 0;
    text-align: right;
    color: rgba(194, 213, 235, 0.72);
    font-size: 0.72rem;
  }

  .checkin-error {
    margin: 0;
    color: rgba(255, 184, 184, 0.95);
    font-size: 0.8rem;
  }

  .submit-checkin {
    min-height: 2.8rem;
    border-radius: var(--home-radius-lg);
    border: none;
    background: linear-gradient(135deg, var(--home-cta-start), var(--home-cta-end));
    color: var(--home-cta-text);
    font-weight: 700;
    font-size: 0.95rem;
  }

  .submit-checkin:disabled {
    opacity: 0.75;
  }

  .chapter-sheet {
    position: relative;
    overflow: hidden;
    border-radius: 1.2rem;
    border: 1px solid rgba(214, 190, 141, 0.2);
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
    background:
      linear-gradient(160deg, rgba(21, 25, 42, 0.9), rgba(10, 14, 24, 0.94)),
      radial-gradient(circle at top center, rgba(214, 190, 141, 0.16), transparent 52%);
  }

  .chapter-sheet__halo {
    position: absolute;
    inset: -10% 8% auto 8%;
    height: 8rem;
    border-radius: 999px;
    filter: blur(24px);
    opacity: 0.55;
    background: rgba(214, 190, 141, 0.24);
    pointer-events: none;
  }

  .chapter-sheet--care .chapter-sheet__halo {
    background: rgba(132, 214, 179, 0.28);
  }

  .chapter-sheet--social .chapter-sheet__halo {
    background: rgba(233, 162, 122, 0.28);
  }

  .chapter-sheet--mission .chapter-sheet__halo {
    background: rgba(222, 186, 103, 0.28);
  }

  .chapter-sheet--play .chapter-sheet__halo {
    background: rgba(124, 220, 224, 0.28);
  }

  .chapter-sheet--bond .chapter-sheet__halo {
    background: rgba(214, 190, 141, 0.28);
  }

  .chapter-sheet__eyebrow,
  .chapter-sheet h3,
  .chapter-sheet__keepsake,
  .chapter-sheet__body,
  .chapter-sheet__actions {
    position: relative;
    z-index: 1;
  }

  .chapter-sheet__eyebrow {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(224, 231, 255, 0.72);
  }

  .chapter-sheet h3 {
    margin: 0;
    font-family: var(--home-font-display);
    font-size: 1.3rem;
    line-height: 1.12;
    color: rgba(249, 245, 233, 0.98);
  }

  .chapter-sheet__keepsake {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.8rem 0.9rem;
    display: grid;
    gap: 0.16rem;
  }

  .chapter-sheet__keepsake span {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(224, 231, 255, 0.68);
  }

  .chapter-sheet__keepsake strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 0.95rem;
  }

  .chapter-sheet__body {
    margin: 0;
    color: rgba(228, 236, 247, 0.9);
    line-height: 1.55;
    font-size: 0.94rem;
  }

  .chapter-sheet__actions {
    display: grid;
    gap: 0.65rem;
  }

  .chapter-sheet__action {
    min-height: 2.9rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(243, 247, 253, 0.95);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  .chapter-sheet__action--primary {
    background: linear-gradient(135deg, rgba(217, 189, 126, 0.92), rgba(176, 130, 70, 0.94));
    color: rgba(23, 17, 10, 0.96);
    border-color: transparent;
  }

  @media (min-width: 720px) {
    .home-secondary {
      width: min(34rem, calc(100vw - 2rem));
      margin: 0 auto;
      padding-left: 0;
      padding-right: 0;
    }
  }
</style>
