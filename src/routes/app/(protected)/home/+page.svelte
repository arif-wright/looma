<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { BookOpen, Leaf, Sparkles } from 'lucide-svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import HeroLivingWorld from '$lib/components/home/fantasy/HeroLivingWorld.svelte';
  import MemvoyaBrand from '$lib/components/brand/MemvoyaBrand.svelte';
  import ProtectedTopbar from '$lib/components/layout/ProtectedTopbar.svelte';
  import { resolveCanonicalArchetypeId } from '$lib/onboarding/archetypes';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import type { Companion } from '$lib/stores/companions';
  import type { PageData } from './$types';
  import { sendAnalytics } from '$lib/utils/analytics';
  import {
    firstBondPendingCopy,
    completedBondContinuityCopy,
    hasCompletedFirstBond,
    isFirstBondMoment,
    isRecoverableMemoryFailure,
    journalMomentHref,
    journalMomentToContinuity,
    persistedReflectionToContinuity,
    resolveHomeBondPercent,
    shouldShowReturningPremiumInvitation
  } from '$lib/launch/proofIntegrity';
  import { bondClosenessFromScore } from '$lib/companions/relationshipState';

  export let data: PageData;
  let pageMounted = false;
  let heroModelLoaded = false;
  let optimisticCompanionName: string | null = null;
  let checkinMood = 'calm';
  let checkinReflection = '';
  let checkinPending = false;
  let checkinError: string | null = null;
  let checkinRecoveryPending = false;
  let checkinReaction: string | null = null;
  let formedMemory: { id: string; title: string; body: string; href: string; persisted: true; createdAt?: string } | null = null;
  let bondActionElement: HTMLElement | null = null;
  let reflectionInput: HTMLTextAreaElement | null = null;
  let continuityElement: HTMLElement | null = null;
  let premiumInvitationElement: HTMLElement | null = null;
  let beganAsFirstBond = false;
  const recordedVisibilityEvents = new Set<string>();

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
  const numberOr = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const clampPercent = (value: unknown, fallback = 0) => Math.min(100, Math.max(0, Math.round(numberOr(value, fallback))));
  const resolveBondPercent = (companion: any) => {
    if (!companion) return 0;
    const stats = companion.stats ?? null;
    const statsBondScore = Array.isArray(stats) ? stats[0]?.bond_score : stats?.bond_score;
    return clampPercent(
      resolveHomeBondPercent({
        bondScore: statsBondScore ?? companion.bondScore,
        affection: companion.affection,
        trust: companion.trust
      })
    );
  };
  $: activeCompanion = data.activeCompanion ?? null;
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
  $: playerLevel = Math.max(1, Math.floor((data.stats as any)?.level ?? activeCompanion?.bondLevel ?? 1));
  $: playerXp = Math.max(0, Math.floor((data.stats as any)?.xp ?? 0));
  $: playerXpNext = Math.max(playerXp + 1, Math.floor((data.stats as any)?.xp_next ?? 100));
  $: companionName = optimisticCompanionName ?? activeCompanion?.name ?? 'Lumi';
  $: activeCompanionHref = activeCompanion?.id ? `/app/companions?focus=${encodeURIComponent(activeCompanion.id)}` : '/app/companions';
  $: companionArchetype = resolveSceneArchetype(activeCompanion?.species);
  $: heroBackgroundUrl = backgroundByArchetype[companionArchetype] ?? '/assets/muse_background.png';
  $: heroScenePlacement = {
    ...defaultHeroScenePlacement,
    ...(heroScenePlacementByArchetype[companionArchetype] ?? {})
  };
  $: heroSceneStyle = buildHeroSceneStyle(heroScenePlacement, heroBackgroundUrl);
  $: companionBond = resolveBondPercent(activeCompanion);
  $: companionLevel = Math.max(1, Math.floor(activeCompanion?.bondLevel ?? 1));
  $: companionMood = normalizedMood(activeCompanion?.mood);
  $: activeCompanionEffective = activeCompanion
    ? computeCompanionEffectiveState(
        {
          ...activeCompanion,
          species: activeCompanion.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          mood: activeCompanion.mood ?? 'steady',
          avatar_url: activeCompanion.avatar_url ?? null,
          created_at: activeCompanion.updated_at ?? new Date().toISOString(),
          updated_at: activeCompanion.updated_at ?? new Date().toISOString()
        } as Companion
      )
    : null;
  $: companionNeedsRest = (activeCompanionEffective?.energy ?? activeCompanion?.energy ?? 100) <= 25;
  $: canCompleteSharedRest = companionNeedsRest && Boolean(data.canSharedRest);
  $: relationalState = bondClosenessFromScore(companionBond);
  $: completedFirstBond = hasCompletedFirstBond({
    hasCompanion: Boolean(activeCompanion?.id),
    firstBondCompletedAt: activeCompanion?.first_bond_completed_at,
    persistedReflection: (data.persistedReflection as any) ?? null
  });
  $: completedBondCopy = completedBondContinuityCopy(companionName);
  $: latestRememberedMoment =
    formedMemory ??
    persistedReflectionToContinuity((data.persistedReflection as any) ?? null, activeCompanion?.id) ??
    (journalMomentToContinuity(data.journalMoments?.[0]) ??
      ((data.memorySummary as any)?.summary_text
        ? {
            id: `summary-${(data.memorySummary as any).last_built_at ?? 'current'}`,
            title: `${companionName} remembers`,
            body: (data.memorySummary as any).summary_text,
            href: '/app/memory',
            persisted: true as const
          }
        : null));
  $: relationalReason =
    latestRememberedMoment?.body ??
    (data.latestDailyCheckin
      ? `${companionName} remembers that you last arrived feeling ${String(data.latestDailyCheckin.mood).toLowerCase()}.`
      : completedFirstBond
        ? completedBondCopy.relationalReason
        : `${companionName} is waiting for your first shared moment.`);
  $: firstBond = isFirstBondMoment(Boolean(activeCompanion?.id), completedFirstBond);
  $: rememberedReturn =
    pageMounted &&
    !beganAsFirstBond &&
    !formedMemory &&
    Boolean(data.persistedReflection?.id);
  $: showPremiumInvitation = shouldShowReturningPremiumInvitation({
    firstBondCompleted: completedFirstBond,
    hasPersistedContinuity: Boolean(data.persistedReflection?.id),
    rememberedReturn,
    subscriptionActive: Boolean(data.subscriptionActive),
    subscriptionStatusConfirmed: Boolean(data.subscriptionStatusConfirmed)
  });
  $: showHomeSplash = !pageMounted || !heroModelLoaded;

  const recordLaunchEvent = (eventType: string, payload: Record<string, unknown> = {}) =>
    sendAnalytics(eventType, { surface: 'home', payload });

  const isVisible = (element: HTMLElement | null) => {
    if (!element || document.visibilityState !== 'visible') return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  };

  const recordShownOnce = (
    eventType: string,
    element: HTMLElement | null,
    payload: Record<string, unknown>,
    surface = 'home'
  ) => {
    if (recordedVisibilityEvents.has(eventType) || !isVisible(element)) return;
    recordedVisibilityEvents.add(eventType);
    sendAnalytics(eventType, { surface, payload });
  };

  const recordContinuityVisibility = () => {
    if (!latestRememberedMoment?.persisted) return;
    recordShownOnce(firstBond || beganAsFirstBond ? 'first_memory_shown' : 'return_memory_shown', continuityElement, {
      companionId: activeCompanion?.id ?? null,
      memoryId: latestRememberedMoment.id
    });
  };

  const recordPremiumInvitationVisibility = () => {
    if (!showPremiumInvitation) return;
    recordShownOnce(
      'premium_offer_viewed',
      premiumInvitationElement,
      {
        companionId: activeCompanion?.id ?? null,
        rememberedReturn,
        tier: 'sanctuary_plus'
      },
      'home_continuity'
    );
  };

  const recordPremiumUpgradeClick = () => {
    sendAnalytics('premium_upgrade_clicked', {
      surface: 'home_continuity',
      payload: {
        companionId: activeCompanion?.id ?? null,
        rememberedReturn,
        tier: 'sanctuary_plus'
      }
    });
  };

  const keepReflectionVisible = () => {
    if (!reflectionInput || document.activeElement !== reflectionInput || window.innerWidth > 760) return;
    window.setTimeout(() => bondActionElement?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  };

  const submitCheckin = async () => {
    if (!activeCompanion?.id || checkinPending) return;
    const reflection = checkinReflection.trim();
    const completingFirstBond = firstBond || beganAsFirstBond;
    if (reflection.length < 3) {
      checkinError = `Share a few words so ${companionName} has something real to remember.`;
      return;
    }
    checkinPending = true;
    checkinError = null;
    checkinRecoveryPending = false;
    try {
      const requestBody = JSON.stringify({ companionId: activeCompanion.id, mood: checkinMood, reflection });
      let response = await fetch('/api/home/reconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody
      });
      let payload = await response.json().catch(() => null);
      if (!response.ok && isRecoverableMemoryFailure(payload)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        response = await fetch('/api/home/reconnect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody
        });
        payload = await response.json().catch(() => null);
      }
      if (!response.ok) {
        if (completingFirstBond && isRecoverableMemoryFailure(payload)) {
          checkinRecoveryPending = true;
          checkinError = null;
        } else {
          checkinError = payload?.message ?? 'This moment could not be shared right now.';
        }
        return;
      }
      checkinReaction = payload?.reaction?.text ?? `${companionName} is glad you came back.`;
      formedMemory = payload?.memory
        ? {
            id: payload.memory.id,
            title: payload.memory.title,
            body: payload.memory.body,
            href: journalMomentHref(activeCompanion.id, payload.memory.id),
            persisted: true,
            createdAt: payload.memory.createdAt
          }
        : null;
      recordLaunchEvent(completingFirstBond ? 'first_checkin_completed' : 'return_checkin_completed', {
        companionId: activeCompanion.id
      });
      if (formedMemory) {
        recordLaunchEvent(completingFirstBond ? 'first_memory_persisted' : 'return_memory_persisted', {
          companionId: activeCompanion.id,
          memoryId: formedMemory.id
        });
      }
      await tick();
      recordShownOnce(completingFirstBond ? 'first_response_shown' : 'return_response_shown', bondActionElement, {
        companionId: activeCompanion.id
      });
      recordContinuityVisibility();
      await invalidateAll();
    } catch {
      checkinError = 'This moment could not be shared right now.';
    } finally {
      checkinPending = false;
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
    beganAsFirstBond = firstBond;
    recordLaunchEvent('home_viewed', { companionId: activeCompanion?.id ?? null, firstBond });
    const recordVisibleContent = () => {
      recordContinuityVisibility();
      recordPremiumInvitationVisibility();
    };
    window.addEventListener('scroll', recordVisibleContent, { passive: true });
    window.addEventListener('resize', recordVisibleContent);
    window.visualViewport?.addEventListener('resize', keepReflectionVisible);
    void tick().then(recordVisibleContent);
    return () => {
      window.removeEventListener('scroll', recordVisibleContent);
      window.removeEventListener('resize', recordVisibleContent);
      window.visualViewport?.removeEventListener('resize', keepReflectionVisible);
    };
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
    activePath={$page.url.pathname}
  />

  <main class="home-main" aria-label="Memvoya companion home">
    <ProtectedTopbar
      {shardBalance}
      launchFocused={true}
      showWallet={false}
      notifications={(data as any)?.notifications ?? []}
      profileDisplayName={playerName}
      {profileAvatarUrl}
    />
    <header class="mobile-topbar">
      <div class="mobile-brand">
        <MemvoyaBrand href="/app/home" size="sm" showMark={false} ariaLabel="Memvoya home" />
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
          mood={companionMood}
          bond={companionBond}
          onRename={renameHomeCompanion}
          {relationalState}
          {relationalReason}
        >
          <svelte:fragment slot="primary-action">
            <section class="bond-action" aria-label="Primary companion action" bind:this={bondActionElement}>
              {#if checkinReaction}
                <span class="bond-action__eyebrow">{firstBond || beganAsFirstBond ? 'Your first moment together' : `What ${companionName} noticed`}</span>
                <p>{checkinReaction}</p>
                {#if formedMemory}
                  <a href={formedMemory.href}>See the moment {companionName} remembered</a>
                {:else}
                  <small>Your check-in was shared, but it has not been added to remembered moments yet.</small>
                {/if}
              {:else}
                <span class="bond-action__eyebrow">{firstBond ? 'Your first shared moment' : 'Return gently'}</span>
                <label>
                  <span>How are you arriving?</span>
                  <select bind:value={checkinMood}>
                    <option value="calm">Steady</option>
                    <option value="curious">Curious</option>
                    <option value="energized">Energized</option>
                    <option value="heavy">Heavy</option>
                    <option value="numb">Quiet</option>
                  </select>
                </label>
                <textarea
                  bind:this={reflectionInput}
                  bind:value={checkinReflection}
                  rows="2"
                  maxlength="480"
                  placeholder={`Share a few words with ${companionName}...`}
                  on:focus={keepReflectionVisible}
                ></textarea>
                {#if checkinRecoveryPending}
                  <div class="bond-action__pending" role="status">
                    <strong>This moment is still waiting safely on this screen.</strong>
                    <span>{firstBondPendingCopy(companionName)}</span>
                  </div>
                {/if}
                {#if checkinError}<small role="alert">{checkinError}</small>{/if}
                <button type="button" disabled={checkinPending || !activeCompanion?.id} on:click={submitCheckin}>
                  {checkinPending ? 'Sharing...' : checkinRecoveryPending ? 'Try saving this moment again' : firstBond ? 'Share your first moment' : `Check in with ${companionName}`}
                </button>
              {/if}
            </section>
          </svelte:fragment>
        </HeroLivingWorld>

        <section class="continuity-card" aria-label="Remembered continuity" bind:this={continuityElement}>
          <div>
            <span>{formedMemory ? 'Remembered from this visit' : latestRememberedMoment ? `${companionName} carried this back to you` : completedFirstBond ? 'Your shared history is already underway' : 'Your shared history begins here'}</span>
            <h2>{latestRememberedMoment?.title ?? (completedFirstBond ? completedBondCopy.title : `${companionName} is ready for a first remembered moment`)}</h2>
            <p>{latestRememberedMoment?.body ?? (completedFirstBond ? completedBondCopy.body : `Share one honest moment above. Once it is safely in your Journal, ${companionName} can carry it into a later visit.`)}</p>
            {#if latestRememberedMoment}
              <small>This is persisted in your Journal, not generated just for this screen.</small>
            {/if}
          </div>
          {#if latestRememberedMoment}
            <a href={latestRememberedMoment.href}><BookOpen size={18} /> Revisit in Journal</a>
          {:else if completedFirstBond}
            <a href={activeCompanion?.id ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}` : '/app/memory'}><BookOpen size={18} /> Open Journal</a>
          {/if}
        </section>

        {#if showPremiumInvitation}
          <aside class="premium-invitation" aria-label="Sanctuary+ invitation" bind:this={premiumInvitationElement}>
            <div>
              <span>Optional depth for your shared space</span>
              <strong>Let your shared history live in a richer sanctuary.</strong>
              <p>Sanctuary+ adds deeper Journal readings and atmosphere. Your core bond with {companionName} remains free.</p>
            </div>
            <a href="/app/wallet" on:click={recordPremiumUpgradeClick}>Explore Sanctuary+</a>
          </aside>
        {/if}

        <nav class="relationship-links" aria-label="Supporting relationship actions">
          <a href={activeCompanionHref}><Sparkles size={18} /><span>Companion</span></a>
          <a href="/app/memory"><BookOpen size={18} /><span>Journal</span></a>
          {#if canCompleteSharedRest}
            <a href="/app/sanctuary#shared-rest"><Leaf size={18} /><span>Rest together</span></a>
          {/if}
        </nav>

      </section>

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

  .mobile-topbar,
  .content-grid {
    position: relative;
    z-index: 2;
  }

  .mobile-brand,
  .mobile-topbar {
    display: none;
  }

  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.95rem;
    align-items: start;
  }

  .bond-action {
    display: grid;
    max-width: 24rem;
    gap: 0.65rem;
    margin-top: 1.15rem;
    border: 1px solid rgba(210, 190, 255, 0.24);
    border-radius: 1rem;
    background: rgba(7, 8, 24, 0.72);
    padding: 0.85rem;
    box-shadow: 0 18px 42px rgba(1, 3, 16, 0.32);
    backdrop-filter: blur(18px);
  }

  .bond-action__eyebrow,
  .continuity-card span {
    color: rgba(194, 159, 255, 0.92);
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .bond-action label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    color: rgba(246, 243, 255, 0.9);
    font-size: 0.78rem;
    font-weight: 750;
  }

  .bond-action select,
  .bond-action textarea {
    border: 1px solid rgba(211, 196, 255, 0.2);
    border-radius: 0.72rem;
    background: rgba(255, 255, 255, 0.055);
    color: white;
  }

  .bond-action select {
    padding: 0.45rem 0.6rem;
  }

  .bond-action textarea {
    width: 100%;
    resize: vertical;
    padding: 0.65rem 0.72rem;
    font: inherit;
  }

  .bond-action button,
  .bond-action a {
    min-height: 2.8rem;
    border: 1px solid rgba(222, 199, 255, 0.4);
    border-radius: 0.78rem;
    background: linear-gradient(135deg, rgba(119, 98, 255, 0.96), rgba(174, 73, 235, 0.96));
    color: white;
    font-weight: 850;
    text-align: center;
    text-decoration: none;
  }

  .bond-action a {
    display: grid;
    place-items: center;
  }

  .bond-action p,
  .bond-action small {
    margin: 0;
    color: rgba(238, 233, 255, 0.82);
    line-height: 1.45;
  }

  .bond-action__pending {
    display: grid;
    gap: 0.25rem;
    border: 1px solid rgba(224, 194, 255, 0.24);
    border-radius: 0.75rem;
    background: rgba(120, 91, 190, 0.12);
    padding: 0.65rem 0.75rem;
    color: rgba(238, 233, 255, 0.82);
    font-size: 0.76rem;
    line-height: 1.4;
  }

  .bond-action__pending strong {
    color: rgba(255, 255, 255, 0.96);
  }

  .continuity-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid rgba(166, 137, 255, 0.2);
    border-radius: 1.1rem;
    background: rgba(10, 11, 31, 0.72);
    padding: 1rem 1.1rem;
    backdrop-filter: blur(18px);
  }

  .continuity-card h2,
  .continuity-card p {
    margin: 0;
  }

  .continuity-card small {
    display: block;
    margin-top: 0.45rem;
    color: rgba(196, 185, 235, 0.62);
    font-size: 0.72rem;
  }

  .continuity-card h2 {
    margin-top: 0.2rem;
    color: white;
    font-size: 1.05rem;
  }

  .continuity-card p {
    max-width: 45rem;
    margin-top: 0.35rem;
    color: rgba(231, 225, 255, 0.72);
    line-height: 1.45;
  }

  .continuity-card a,
  .relationship-links a {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: rgba(242, 238, 255, 0.9);
    font-weight: 800;
    text-decoration: none;
  }

  .continuity-card a {
    flex: 0 0 auto;
    border: 1px solid rgba(209, 190, 255, 0.2);
    border-radius: 999px;
    padding: 0.65rem 0.8rem;
  }

  .premium-invitation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid rgba(184, 158, 255, 0.15);
    border-radius: 1rem;
    background: rgba(18, 17, 44, 0.56);
    padding: 0.8rem 1rem;
    color: rgba(236, 230, 255, 0.78);
    backdrop-filter: blur(16px);
  }

  .premium-invitation div {
    display: grid;
    gap: 0.16rem;
  }

  .premium-invitation span {
    color: rgba(194, 159, 255, 0.82);
    font-size: 0.65rem;
    font-weight: 850;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .premium-invitation strong {
    color: rgba(250, 248, 255, 0.94);
    font-size: 0.88rem;
  }

  .premium-invitation p {
    margin: 0;
    font-size: 0.76rem;
  }

  .premium-invitation a {
    flex: 0 0 auto;
    border: 1px solid rgba(209, 190, 255, 0.2);
    border-radius: 999px;
    padding: 0.55rem 0.72rem;
    color: rgba(242, 238, 255, 0.9);
    font-size: 0.76rem;
    font-weight: 800;
    text-decoration: none;
  }

  .relationship-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .relationship-links a {
    border: 1px solid rgba(186, 160, 255, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    padding: 0.6rem 0.8rem;
    font-size: 0.78rem;
  }

  .center-stack {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  @media (max-width: 1380px) {
    .home-main::before,
    .home-main::after {
      right: 0;
    }

    .content-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 1180px) {
    .fantasy-home {
      grid-template-columns: 1fr;
    }

    .home-main {
      padding: 1rem;
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

    .mobile-topbar {
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: space-between;
      left: 1.25rem;
      right: 1.25rem;
      top: max(1.05rem, calc(env(safe-area-inset-top) + 0.45rem));
      z-index: 90;
      margin: 0;
      pointer-events: auto;
    }

    .mobile-brand {
      display: inline-flex;
      align-items: center;
    }

    .content-grid,
    .center-stack {
      display: block;
    }

    .bond-action {
      scroll-margin-block: 5rem calc(6rem + env(safe-area-inset-bottom));
    }

    .bond-action textarea {
      min-height: 4.5rem;
      resize: none;
      font-size: 16px;
    }

    .bond-action button {
      min-height: 3rem;
    }

    .premium-invitation {
      align-items: stretch;
      flex-direction: column;
    }

    .premium-invitation a {
      justify-content: center;
      min-height: 2.75rem;
    }

  }
</style>
