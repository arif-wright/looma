<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import Modal from '$lib/components/ui/Modal.svelte';
  import EventRow from '$lib/components/companions/EventRow.svelte';
  import type { Companion } from '$lib/stores/companions';
  import { describeMilestoneToast } from '$lib/companions/bond';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import { describeRitualCompletion } from '$lib/companions/rituals';
  import { getBondBonusForLevel, formatBonusSummary, getBondTierForLevel } from '$lib/companions/bond';
  import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
  import { BOND_LEVEL_TOOLTIP, MOOD_TOOLTIP, describeBondLevelUpToast } from '$lib/companions/companionCopy';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import { devLog, safeUiMessage } from '$lib/utils/safeUiError';
  import {
    captureCompanionPortrait,
    clearCachedCompanionPortrait,
    getCachedCompanionPortrait,
    isProbablyNonBlankPortrait,
    isProbablyValidPortrait
  } from '$lib/companions/portrait';
  import { computeCompanionEffectiveState, formatLastCareLabel } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';
  import { shouldUploadPortrait, uploadCompanionPortrait, markPortraitUploaded } from '$lib/companions/portraitUpload';
  import {
    OPTIONAL_COMPANION_RITUALS,
    OPTIONAL_COMPANION_RITUAL_MAP,
    type OptionalCompanionRitualKey
  } from '$lib/companions/optionalRituals';
  import { companionPrefs } from '$lib/stores/companionPrefs';
  import { pushCompanionReaction } from '$lib/stores/companionReactions';

  export let open = false;
  export let companion: Companion | null = null;
  export let evolutionStageLabel: string | null = null;
  export let archetypeRenderHook: string | null = null;
  export let maxSlots = 3;
  export let onClose: () => void = () => {};
  export let renameCompanion: (id: string, name: string) => Promise<void> = async () => {};
  export let setActive: (id: string) => Promise<void> = async () => {};
  export let setState: (id: string, state: 'idle' | 'resting' | 'active') => Promise<void> = async () => {};
  export let prefetched: { version: number; events: CareEvent[] } = { version: 0, events: [] };
  // Prefer capturing a portrait from an already-rendered model-viewer instance (single WebGL context).
  export let capturePortrait: (() => Promise<string | null>) | null = null;
  // If false, the modal will not mount a live MuseModel and will rely on capture/cache.
  export let allowLivePortrait = true;

  type CareEvent = {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
    note?: string | null;
    kind?: string | null;
  };

  const dispatch = createEventDispatcher<{
    careApplied: { id: string; companion: Companion };
    milestone: { id: string; action: string; note?: string | null; message?: string };
    toast: { message: string; kind?: 'success' | 'error' };
  }>();

  type CareAction = 'feed' | 'play' | 'groom';
  type OptionalMood = { label: string; expiresAt: string };

  const CARE_ACTIONS: Array<{ key: CareAction; label: string; effect: string; description: string }> = [
    { key: 'feed', label: 'Feed', effect: 'Energy up', description: 'A small refill and a softer bond.' },
    { key: 'play', label: 'Play', effect: 'Trust up', description: 'Shared motion builds closeness.' },
    { key: 'groom', label: 'Groom', effect: 'Calm reset', description: 'A quiet routine to settle the day.' }
  ];

  const CLIENT_COOLDOWN_MS = 4000;
  const CARE_ERROR_GENERIC = 'Something went wrong while caring for your companion. Please try again.';
  let previousBondLevel: number | null = null;
  let bondLevelCelebration: { level: number } | null = null;
  let bondLevelTimer: ReturnType<typeof setTimeout> | null = null;

  const emitCareErrorToast = () => {
    dispatch('toast', { message: CARE_ERROR_GENERIC, kind: 'error' });
  };

  let events: CareEvent[] = [];
  let loadingEvents = false;
  let eventsError: string | null = null;
  let renameMode = false;
  let renameValue = '';
  let busy: 'rename' | 'active' | 'state' | null = null;
  let actionMessage: string | null = null;
  let careBusy: CareAction | null = null;
  let careError: string | null = null;
  let cooldownUntil: Record<CareAction, number> = { feed: 0, play: 0, groom: 0 };
  let ritualBusy: OptionalCompanionRitualKey | null = null;
  let ritualError: string | null = null;
  let ritualCooldownUntil: Record<OptionalCompanionRitualKey, number> = {
    listen: 0,
    focus: 0,
    celebrate: 0
  };
  let ritualMood: OptionalMood | null = null;
  let prefersReducedMotion = false;
  let nowTick = Date.now();
  let cooldownTimer: number | null = null;
  let lastFetchedId: string | null = null;
  let lastPrefetchVersion = 0;
  let museRef: MuseModel | null = null;
  let portraitSrc: string | null = null;
  let portraitBusy = false;
  let careSection: HTMLElement | null = null;

  const normalizeEvents = (list: CareEvent[]) => {
    const seen = new Set<string>();
    return list
      .slice()
      .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))
      .filter((event) => {
        const key = String(event.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  };

  const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const describeRelativeTime = (iso: string | null) => {
    if (!iso) return 'No care yet';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'just now';
    const diffMs = ts - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    if (Math.abs(diffMinutes) < 1) {
      const diffSeconds = Math.round(diffMs / 1000);
      return relativeFormatter.format(diffSeconds, 'second');
    }
    if (Math.abs(diffMinutes) < 60) {
      return relativeFormatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return relativeFormatter.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return relativeFormatter.format(diffDays, 'day');
  };

  const pickLatest = (values: Array<string | null | undefined>) => {
    let latest: string | null = null;
    let maxTs = -Infinity;
    for (const value of values) {
      if (!value) continue;
      const ts = Date.parse(value);
      if (Number.isNaN(ts)) continue;
      if (ts > maxTs) {
        maxTs = ts;
        latest = value;
      }
    }
    return latest;
  };

  onMount(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = media.matches;
    const mediaHandler = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
    };
    media.addEventListener?.('change', mediaHandler);

    cooldownTimer = window.setInterval(() => {
      nowTick = Date.now();
    }, 500);
    return () => {
      if (cooldownTimer) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
      media.removeEventListener?.('change', mediaHandler);
    };
  });

  onDestroy(() => {
    clearBondTimer();
  });

  const startRename = () => {
    if (!companion) return;
    renameValue = companion.name;
    renameMode = true;
    actionMessage = null;
  };

  const cancelRename = () => {
    renameMode = false;
    renameValue = '';
  };

  const submitRename = async () => {
    if (!companion) return;
    const next = renameValue.trim();
    if (next.length < 1 || next.length > 32) {
      actionMessage = 'Name must be 1–32 characters.';
      return;
    }
    busy = 'rename';
    actionMessage = null;
    try {
      await renameCompanion(companion.id, next);
      renameMode = false;
    } catch (err) {
      devLog('[CompanionModal] rename failed', err);
      actionMessage = safeUiMessage(err);
    } finally {
      busy = null;
    }
  };

  const handleSetActive = async () => {
    if (!companion || companion.is_active) return;
    busy = 'active';
    actionMessage = null;
    try {
      await setActive(companion.id);
    } catch (err) {
      devLog('[CompanionModal] set active failed', err);
      actionMessage = safeUiMessage(err);
    } finally {
      busy = null;
    }
  };

  const handleStateToggle = async () => {
    if (!companion) return;
    busy = 'state';
    actionMessage = null;
    const nextState = companion.state === 'resting' ? 'idle' : 'resting';
    try {
      await setState(companion.id, nextState);
    } catch (err) {
      devLog('[CompanionModal] state update failed', err);
      actionMessage = safeUiMessage(err);
    } finally {
      busy = null;
    }
  };

  const ensureEvents = async () => {
    if (typeof window === 'undefined') return;
    if (!companion || !open) return;
    if (companion.id === lastFetchedId) return;
    loadingEvents = true;
    eventsError = null;
    try {
      const res = await fetch(`/api/companions/events?id=${companion.id}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(payload?.events)) {
        throw new Error(payload?.error ?? 'Unable to load events');
      }
      events = normalizeEvents((payload.events as CareEvent[]) ?? []);
      lastFetchedId = companion.id;
    } catch (err) {
      devLog('[CompanionModal] load events failed', err);
      eventsError = safeUiMessage(err);
      events = [];
    } finally {
      loadingEvents = false;
    }
  };

  $: if (open && companion) {
    void ensureEvents();
  }

  $: if (!open) {
    renameMode = false;
    actionMessage = null;
    careError = null;
    resetCareState();
    portraitBusy = false;
    ritualBusy = null;
    ritualError = null;
    ritualMood = null;
    ritualCooldownUntil = {
      listen: 0,
      focus: 0,
      celebrate: 0
    };
  }

  let currentCompanionId: string | null = null;
  $: if ((companion?.id ?? null) !== currentCompanionId) {
    currentCompanionId = companion?.id ?? null;
    lastFetchedId = null;
    events = [];
    eventsError = null;
    renameMode = false;
    renameValue = '';
    actionMessage = null;
    careError = null;
    resetCareState();
    const cached = currentCompanionId ? getCachedCompanionPortrait(currentCompanionId) : null;
    portraitSrc = isProbablyValidPortrait(cached) ? cached : null;
  }

  $: if (prefetched && prefetched.version !== lastPrefetchVersion) {
    if (prefetched.events?.length) {
      events = normalizeEvents([...prefetched.events, ...events]);
    }
    lastPrefetchVersion = prefetched.version;
  }

  const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  $: moodKey = (companion?.mood ?? 'neutral').toLowerCase();
  $: statsRecord = companion?.stats ?? null;
  $: lastCareActive = statsRecord ? pickLatest([statsRecord.fed_at, statsRecord.played_at, statsRecord.groomed_at]) : null;
  $: lastPassiveTick = statsRecord?.last_passive_tick ?? null;
  $: lastCareAt = lastCareActive ?? lastPassiveTick ?? null;
  $: effective = companion ? computeCompanionEffectiveState(companion, new Date(nowTick)) : null;
  $: lastCareLabel = effective ? formatLastCareLabel(effective.msSinceCare) : 'No care yet';
  $: lastCheckInLabel = effective?.msSinceCheckIn == null ? 'No check-in yet' : formatLastCareLabel(effective.msSinceCheckIn);
  $: portraitAnimation = pickMuseAnimationForMood(effective?.moodKey, { nowMs: nowTick, seed: companion?.id ?? '' });
  $: bondLevel = statsRecord?.bond_level ?? companion?.bond_level ?? 0;
  $: bondScore = statsRecord?.bond_score ?? companion?.bond_score ?? 0;
  $: bondBonus = getBondBonusForLevel(bondLevel);
  $: bondTier = getBondTierForLevel(bondLevel);
  $: bondBonusSummary = formatBonusSummary(bondBonus);
  $: ritualMoodLabel = ritualMood && Date.parse(ritualMood.expiresAt) > nowTick ? ritualMood.label : null;

  const normalizeRarity = (rarity: string | null | undefined) => (rarity ?? 'common').trim().toLowerCase();
  $: rarityClass = normalizeRarity(companion?.rarity);

  const scrollToCare = async () => {
    await tick();
    careSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ensurePortrait = async () => {
    if (!browser) return;
    if (!open || !companion) return;
    const cached = getCachedCompanionPortrait(companion.id);
    if (cached && isProbablyValidPortrait(cached)) {
      if (await isProbablyNonBlankPortrait(cached)) {
        portraitSrc = cached;
        return;
      }
      clearCachedCompanionPortrait(companion.id);
      portraitSrc = null;
    }
    if (cached && !isProbablyValidPortrait(cached)) {
      clearCachedCompanionPortrait(companion.id);
      portraitSrc = null;
    }
    if (portraitBusy) return;
    portraitBusy = true;
    try {
      await tick();
      for (let i = 0; i < 8; i++) {
        const dataUrl = await captureCompanionPortrait(companion.id, () => {
          if (capturePortrait) return capturePortrait();
          return museRef?.capturePortrait?.() ?? Promise.resolve(null);
        });
        if (dataUrl) {
          portraitSrc = dataUrl;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      portraitBusy = false;
    }
  };

  const resetCareState = () => {
    careBusy = null;
    careError = null;
    cooldownUntil = { feed: 0, play: 0, groom: 0 };
  };

  const formatCareError = (message: string | null | undefined) => {
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
    return CARE_ERROR_GENERIC;
  };

  const clearBondTimer = () => {
    if (bondLevelTimer) {
      clearTimeout(bondLevelTimer);
      bondLevelTimer = null;
    }
  };

  const triggerBondCelebration = () => {
    clearBondTimer();
    bondLevelCelebration = { level: bondLevel };
    bondLevelTimer = setTimeout(() => {
      bondLevelCelebration = null;
      bondLevelTimer = null;
    }, 3600);
  };

  const startCooldown = (action: CareAction) => {
    cooldownUntil = { ...cooldownUntil, [action]: Date.now() + CLIENT_COOLDOWN_MS };
  };

  $: {
    if (!companion) {
      previousBondLevel = null;
      bondLevelCelebration = null;
      clearBondTimer();
    } else {
      if (previousBondLevel !== null && bondLevel > previousBondLevel) {
        triggerBondCelebration();
        const toastMessage = describeBondLevelUpToast(companion.name, bondLevel);
        dispatch('toast', { message: toastMessage, kind: 'success' });
      }
      previousBondLevel = bondLevel;
    }
  }

  $: actionCooldowns = {
    feed: Math.max(0, Math.ceil((cooldownUntil.feed - nowTick) / 1000)),
    play: Math.max(0, Math.ceil((cooldownUntil.play - nowTick) / 1000)),
    groom: Math.max(0, Math.ceil((cooldownUntil.groom - nowTick) / 1000))
  };

  $: ritualCooldowns = {
    listen: Math.max(0, Math.ceil((ritualCooldownUntil.listen - nowTick) / 1000)),
    focus: Math.max(0, Math.ceil((ritualCooldownUntil.focus - nowTick) / 1000)),
    celebrate: Math.max(0, Math.ceil((ritualCooldownUntil.celebrate - nowTick) / 1000))
  };

  const setRitualCooldown = (key: OptionalCompanionRitualKey, remainingMs: number) => {
    ritualCooldownUntil = {
      ...ritualCooldownUntil,
      [key]: Date.now() + Math.max(0, remainingMs)
    };
  };

  const handleOptionalRitual = async (key: OptionalCompanionRitualKey) => {
    if (!companion || ritualBusy || ritualCooldowns[key] > 0) return;
    ritualBusy = key;
    ritualError = null;
    try {
      const pref = get(companionPrefs);
      const ritualDef = OPTIONAL_COMPANION_RITUAL_MAP.get(key);
      const res = await fetch('/api/companions/rituals/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companionId: companion.id,
          ritualKey: key,
          suppressReactions: !pref.reactionsEnabled
        })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (payload?.error === 'ritual_cooldown' && typeof payload.retryAfter === 'number') {
          setRitualCooldown(key, payload.retryAfter * 1000);
        }
        ritualError = typeof payload?.message === 'string' ? payload.message : 'Could not start ritual right now.';
        return;
      }

      const serverCooldownMs =
        typeof payload?.ritual?.cooldownMs === 'number'
          ? payload.ritual.cooldownMs
          : (ritualDef?.cooldownMs ?? 60 * 60 * 1000);
      setRitualCooldown(key, serverCooldownMs);

      const nextMood =
        payload?.temporaryMood &&
        typeof payload.temporaryMood === 'object' &&
        typeof payload.temporaryMood.label === 'string' &&
        typeof payload.temporaryMood.expiresAt === 'string'
          ? { label: payload.temporaryMood.label, expiresAt: payload.temporaryMood.expiresAt }
          : null;
      if (nextMood) {
        ritualMood = nextMood;
      }

      const reaction = payload?.reaction;
      const reactionText = typeof reaction?.text === 'string' ? reaction.text : null;
      if (reactionText && pref.reactionsEnabled && !prefersReducedMotion) {
        pushCompanionReaction(reaction);
      } else if (reactionText) {
        dispatch('toast', { message: reactionText, kind: 'success' });
      }
    } catch (err) {
      devLog('[CompanionModal] optional ritual failed', err);
      ritualError = safeUiMessage(err);
    } finally {
      ritualBusy = null;
    }
  };

  const handleCareAction = async (action: CareAction) => {
    if (!companion || careBusy || actionCooldowns[action] > 0) return;
    careBusy = action;
    careError = null;
    try {
      const res = await fetch('/api/companions/care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: companion.id, action })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.companion) {
        const message =
          payload?.message ??
          (payload?.error === 'low_energy'
            ? `${companion.name} is too tired to ${action}.`
            : payload?.error ?? null);
        careError = formatCareError(message);
        emitCareErrorToast();
        careBusy = null;
        return;
      }

      const nextCompanion = { ...companion, ...payload.companion };
      companion = nextCompanion;
      if (payload.event) {
        events = normalizeEvents([payload.event as CareEvent, ...events]);
      }
      if (Array.isArray(payload?.milestones) && payload.milestones.length) {
        payload.milestones.forEach((milestone: { action?: string; note?: string | null }) => {
          if (!milestone?.action || !companion) return;
          const toastMessage = describeMilestoneToast(milestone.action, companion.name) ?? 'Bond milestone reached!';
          dispatch('milestone', {
            id: companion.id,
            action: milestone.action,
            note: milestone.note ?? null,
            message: toastMessage
          });
        });
      }
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list);
        if (Array.isArray(payload.rituals.completed) && payload.rituals.completed.length) {
          payload.rituals.completed.forEach((ritual: any) => {
            const toastMessage = describeRitualCompletion(ritual, companion?.name ?? null);
            dispatch('milestone', {
              id: companion?.id ?? '',
              action: ritual.key,
              message: toastMessage
            });
          });
        }
      }
      careError = null;
      startCooldown(action);
      dispatch('careApplied', { id: nextCompanion.id, companion: nextCompanion });
      actionMessage = null;
    } catch (err) {
      devLog('[CompanionModal] care action failed', err);
      careError = formatCareError(safeUiMessage(err));
      emitCareErrorToast();
    } finally {
      careBusy = null;
    }
  };

  $: if (open && companion) {
    void ensurePortrait();
  }

  // If we successfully captured a data-url portrait, persist it to Supabase so mobile can use `avatar_url`.
  $: if (browser && open && companion?.id && typeof portraitSrc === 'string' && portraitSrc.startsWith('data:image/')) {
    const id = companion.id;
    const src = portraitSrc;
    if (shouldUploadPortrait(id, src)) {
      void (async () => {
        try {
          if (!(await isProbablyNonBlankPortrait(src))) return;
          await uploadCompanionPortrait({ companionId: id, dataUrl: src });
          markPortraitUploaded(id, src);
        } catch (err) {
          // Best-effort; ignore errors.
          devLog('[CompanionModal] portrait upload failed', err);
        }
      })();
    }
  }
</script>

<Modal {open} title={companion ? `${companion.name} dossier` : 'Companion dossier'} onClose={onClose}>
  {#if companion}
    <header class="dossier-head">
      <div class="dossier-head__left">
        <div class={`dossier-portrait dossier-portrait--${rarityClass}`}>
          {#if portraitSrc}
            <img src={portraitSrc} alt={`${companion.name} portrait`} class="dossier-portrait__img" />
          {:else if allowLivePortrait}
            <MuseModel
              bind:this={museRef}
              size="112px"
              minSize={0}
              eager={true}
              autoplay={false}
              respectReducedMotion={false}
              animationName={portraitAnimation}
              preserveDrawingBuffer
            />
          {:else}
            <div class="dossier-portrait__placeholder" aria-hidden="true">
              <div class="portrait-orb"></div>
              <p>Generating portrait…</p>
            </div>
          {/if}
          {#if effective}
            <span class={`mood-dot mood-dot--${effective.moodKey}`} aria-hidden="true"></span>
          {/if}
        </div>

        <div class="dossier-title">
          <p class="dossier-title__eyebrow">Companion dossier</p>
          <h2>{companion.name} · {companion.species}</h2>
          <div class="dossier-chips">
            {#if companion.is_active}
              <span class="chip chip--active">Active</span>
            {/if}
            <span class="chip">Bond Lv {bondLevel}</span>
            <span class="chip">Tier {bondTier.name}</span>
            {#if archetypeRenderHook}
              <span class="chip chip--hook">Hook {archetypeRenderHook}</span>
            {/if}
            {#if evolutionStageLabel}
              <span class="chip chip--stage">Evolution {evolutionStageLabel}</span>
            {/if}
            <span class="chip">{effective?.moodLabel ?? 'Calm'}</span>
            <span class="chip">Slot {typeof companion.slot_index === 'number' ? companion.slot_index + 1 : '–'} / {maxSlots}</span>
          </div>
          <div class="dossier-state-row">
            <span class="dossier-state">Last care: {lastCareLabel}</span>
            <span class="dossier-state">Last check-in: {lastCheckInLabel}</span>
            <InfoTooltip text={MOOD_TOOLTIP} label="What mood means" className="mood-hint" />
          </div>
        </div>
      </div>

      <div class="dossier-head__right">
        <button type="button" class="btn btn-primary" on:click={scrollToCare}>Check in with {companion.name}</button>
      </div>
    </header>

    <div class="modal-actions">
      <button type="button" class="btn" on:click={handleSetActive} disabled={companion.is_active || busy === 'active'}>
        {companion.is_active ? 'Currently Active' : busy === 'active' ? 'Activating…' : 'Set Active'}
      </button>
      <button type="button" class="btn" on:click={handleStateToggle} disabled={busy === 'state'}>
        {busy === 'state' ? 'Updating…' : companion.state === 'resting' ? 'Recall' : 'Rest'}
      </button>
      <button type="button" class="btn" on:click={startRename} disabled={busy === 'rename'}>
        Rename
      </button>
    </div>

    <section class="bond-overview" aria-label="Bond bonuses">
      <div class="bond-overview__meter" aria-live="polite">
        <div class="bond-glyph-wrap">
          <div class={`bond-glyph bond-glyph--${bondBonus.strong ? 'strong' : 'normal'}`}>
            <span class="bond-glyph__level">{bondLevel}</span>
            <span class="bond-glyph__label">Bond</span>
          </div>
          <InfoTooltip text={BOND_LEVEL_TOOLTIP} label="Bond level explainer" className="bond-hint" />
        </div>
        <p class="bond-score">Score {bondScore}</p>
      </div>
      <div class="bond-overview__copy">
        {#if bondLevelCelebration}
          <span class="bond-level-tag" role="status">Bond level up! Lv {bondLevelCelebration.level}</span>
        {/if}
        <p class="bond-kicker">{bondTier.name}</p>
        <p class="bond-tier-note">{bondTier.description}</p>
        <p class="bond-summary">{bondBonusSummary}</p>
        <p class="bond-note">Companion bonuses apply while this companion is active.</p>
      </div>
    </section>

    {#if renameMode}
      <form class="rename-form" on:submit|preventDefault={submitRename}>
        <label>
          <span class="sr-only">New name</span>
          <input
            type="text"
            maxlength="32"
            placeholder="New name"
            bind:value={renameValue}
            required
          />
        </label>
        <div class="rename-actions">
          <button type="button" class="btn-secondary" on:click={cancelRename} disabled={busy === 'rename'}>
            Cancel
          </button>
          <button type="submit" class="btn" disabled={busy === 'rename'}>{busy === 'rename' ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    {/if}

    {#if actionMessage}
      <p class="action-message">{actionMessage}</p>
    {/if}

    <section class="stat-grid" aria-label="Bond stats">
      <div class="stat-grid__meta">
        <h3>Bond stats</h3>
        <span class="last-care-pill">Mood: {ritualMoodLabel ?? effective?.moodLabel ?? 'Calm'}</span>
      </div>
      <article>
        <header>Affection</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(effective?.affection ?? companion.affection)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(effective?.affection ?? companion.affection)}%`}></span>
        </div>
      </article>
      <article>
        <header>Trust</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(effective?.trust ?? companion.trust)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(effective?.trust ?? companion.trust)}%`}></span>
        </div>
      </article>
      <article>
        <header>Energy</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(effective?.energy ?? companion.energy)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(effective?.energy ?? companion.energy)}%`}></span>
        </div>
      </article>
    </section>

    <section class="ritual-section" aria-label="Optional rituals">
      <div class="ritual-section__head">
        <div>
          <p class="label">Optional rituals</p>
          <h3>Small moments with {companion.name}</h3>
        </div>
      </div>
      {#if ritualError}
        <p class="care-error" role="alert">{ritualError}</p>
      {/if}
      <div class="ritual-buttons">
        {#each OPTIONAL_COMPANION_RITUALS as ritual}
          <button
            type="button"
            class={`ritual-button ${ritualBusy === ritual.key ? 'busy' : ''}`}
            disabled={!!ritualBusy || ritualCooldowns[ritual.key] > 0}
            on:click={() => handleOptionalRitual(ritual.key)}
          >
            <div class="care-copy">
              <div class="care-title-row">
                <span class="care-title">{ritual.title}</span>
                <span class="care-badge">1h cooldown</span>
              </div>
              <p>{ritual.description}</p>
              <span class="care-cooldown">
                {#if ritualBusy === ritual.key}
                  Starting…
                {:else if ritualCooldowns[ritual.key] > 0}
                  Ready in {ritualCooldowns[ritual.key]}s
                {:else}
                  Ready
                {/if}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    <section class="care-section" aria-label="Care actions" bind:this={careSection}>
      <div class="care-section__head">
        <div>
          <p class="label">Care actions</p>
          <h3>Bond with {companion.name}</h3>
        </div>
      </div>
      {#if careError}
        <p class="care-error" role="alert">{careError}</p>
      {/if}
      <div class="care-buttons">
        {#each CARE_ACTIONS as action}
          <button
            type="button"
            class={`care-button ${careBusy === action.key ? 'busy' : ''}`}
            disabled={!!careBusy || actionCooldowns[action.key] > 0}
            on:click={() => handleCareAction(action.key)}
          >
            <div class="care-copy">
              <div class="care-title-row">
                <span class="care-title">{action.label}</span>
                <span class="care-badge">{action.effect}</span>
              </div>
              <p>{action.description}</p>
              <span class="care-cooldown">
                {#if careBusy === action.key}
                  Working…
                {:else if actionCooldowns[action.key] > 0}
                  Ready in {actionCooldowns[action.key]}s
                {:else}
                  Ready
                {/if}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    <section class="events-panel">
      <h3>Recent care</h3>
      {#if loadingEvents}
        <p>Loading events…</p>
      {:else if events.length === 0}
        <p>{eventsError ?? 'No recent care events yet.'}</p>
      {:else}
        <ul class="event-list">
          {#each events.slice(0, 6) as event (event.id)}
            <EventRow {event} />
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <p>Select a companion to view their dossier.</p>
  {/if}
</Modal>

<style>
  .dossier-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .dossier-head__left {
    display: flex;
    gap: 1rem;
    min-width: 0;
    align-items: flex-start;
  }

  .dossier-head__right {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    flex: 0 0 auto;
  }

  .dossier-portrait {
    width: 112px;
    height: 112px;
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: linear-gradient(160deg, rgba(12, 16, 32, 0.9), rgba(6, 10, 20, 0.7));
    overflow: hidden;
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }

  .dossier-portrait__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .dossier-portrait__placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    gap: 0.4rem;
    text-align: center;
    padding: 0.65rem;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.82rem;
  }

  .portrait-orb {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(94, 234, 212, 0.85), rgba(59, 130, 246, 0.12));
    box-shadow: 0 0 22px rgba(94, 234, 212, 0.25);
  }

  .dossier-portrait--rare {
    border-color: rgba(148, 163, 255, 0.35);
    box-shadow: inset 0 0 22px rgba(148, 163, 255, 0.14);
  }

  .dossier-portrait--epic {
    border-color: rgba(217, 70, 239, 0.35);
    box-shadow: inset 0 0 22px rgba(217, 70, 239, 0.16);
  }

  .dossier-portrait--legendary {
    border-color: rgba(251, 191, 36, 0.45);
    box-shadow: inset 0 0 24px rgba(251, 191, 36, 0.18);
  }

  .mood-dot {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(148, 163, 184, 0.85);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.25);
  }

  .mood-dot--radiant,
  .mood-dot--calm {
    background: rgba(94, 234, 212, 0.9);
  }

  .mood-dot--quiet,
  .mood-dot--waiting {
    background: rgba(148, 163, 255, 0.9);
  }

  .mood-dot--resting,
  .mood-dot--distant {
    background: rgba(251, 191, 36, 0.9);
  }

  .dossier-title {
    min-width: 0;
  }

  .dossier-title__eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .dossier-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .chip {
    padding: 0.22rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.82);
    background: rgba(255, 255, 255, 0.04);
  }

  .chip--active {
    border-color: rgba(94, 234, 212, 0.35);
    box-shadow: inset 0 0 18px rgba(94, 234, 212, 0.12);
  }

  .chip--hook {
    border-color: rgba(186, 157, 255, 0.44);
    color: rgba(229, 216, 255, 0.95);
    background: rgba(186, 157, 255, 0.12);
  }

  .chip--stage {
    border-color: rgba(94, 242, 255, 0.4);
    color: rgba(188, 246, 255, 0.94);
    background: rgba(94, 242, 255, 0.1);
  }

  .dossier-state-row {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    color: rgba(226, 232, 255, 0.78);
    font-size: 0.85rem;
  }

  .dossier-state {
    padding: 0.22rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(9, 12, 25, 0.55);
  }

  .modal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .btn,
  .btn-secondary {
    border-radius: 999px;
    padding: 0.55rem 1.2rem;
    font-size: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .btn-secondary {
    background: transparent;
  }

  .btn-primary {
    border-color: rgba(94, 234, 212, 0.35);
    background: rgba(94, 234, 212, 0.12);
  }

  .btn:disabled,
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .rename-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .rename-form input {
    border-radius: 12px;
    padding: 0.65rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(12, 15, 26, 0.8);
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
  }

  .rename-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .action-message {
    color: #f87171;
    font-size: 0.9rem;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .stat-grid__meta {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
  }

  .stat-grid__meta h3 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .last-care-pill {
    border-radius: 999px;
    padding: 0.2rem 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.75);
    background: rgba(9, 12, 25, 0.65);
  }

  .stat-grid header {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.35rem;
  }

  .meter {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(99, 247, 255, 0.9), rgba(85, 121, 255, 0.9));
  }

  .events-panel h3 {
    margin-bottom: 0.5rem;
  }

  .events-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .care-section {
    margin: 1.5rem 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .care-section__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .care-section .label {
    margin: 0;
    letter-spacing: 0.18em;
  }

  .care-buttons {
    display: grid;
    gap: 0.75rem;
  }

  .ritual-section {
    margin: 1.5rem 0;
    border: 1px solid rgba(147, 197, 253, 0.2);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(147, 197, 253, 0.06);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .ritual-section__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .ritual-buttons {
    display: grid;
    gap: 0.75rem;
  }

  .bond-overview {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1rem;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    padding: 1rem;
    background: rgba(12, 15, 26, 0.6);
  }

  .bond-overview__meter {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }

  .bond-glyph-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .bond-glyph {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto 0.5rem;
    background: radial-gradient(circle at 30% 20%, rgba(173, 216, 255, 0.6), transparent),
      rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(94, 234, 212, 0.35);
    box-shadow: inset 0 0 20px rgba(56, 189, 248, 0.25);
  }

  .bond-glyph--strong {
    border-color: rgba(248, 250, 252, 0.65);
    box-shadow: inset 0 0 28px rgba(248, 250, 252, 0.4);
  }

  .bond-glyph__level {
    font-size: 2.25rem;
    font-weight: 700;
    line-height: 1;
  }

  .bond-glyph__label {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .bond-score {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 255, 0.75);
  }

  .bond-overview__copy {
    display: grid;
    gap: 0.3rem;
  }

  .bond-level-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    border: 1px solid rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.15);
    color: rgba(251, 191, 36, 0.95);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.2rem 0.85rem;
    animation: bondTagPop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .bond-kicker {
    margin: 0;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(189, 246, 255, 0.85);
  }

  .bond-summary,
  .bond-note,
  .bond-tier-note {
    margin: 0;
    color: rgba(226, 232, 255, 0.85);
  }

  .bond-tier-note {
    color: rgba(196, 245, 255, 0.86);
  }

  .bond-note {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.85);
  }

  @keyframes bondTagPop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bond-level-tag {
      animation: none;
    }
  }

  .care-button {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 10, 20, 0.9);
    padding: 0.85rem 1rem;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-align: left;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .care-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(10, 13, 24, 0.95);
  }

  .care-button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .ritual-button {
    border-radius: 16px;
    border: 1px solid rgba(147, 197, 253, 0.24);
    background: rgba(8, 10, 20, 0.9);
    padding: 0.85rem 1rem;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-align: left;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .ritual-button:hover:not(:disabled) {
    border-color: rgba(147, 197, 253, 0.5);
    background: rgba(10, 13, 24, 0.95);
  }

  .ritual-button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .care-copy {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .care-title-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .care-title {
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.8rem;
  }

  .care-badge {
    border-radius: 999px;
    padding: 0.15rem 0.65rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.05);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.8);
    flex: 0 0 auto;
  }

  .care-copy p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .care-cooldown {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .care-error {
    border-radius: 12px;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.2);
    font-size: 0.9rem;
  }

  .event-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

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

  @media (max-width: 720px) {
    .dossier-head {
      flex-direction: column;
      align-items: stretch;
    }

    .dossier-head__right {
      justify-content: stretch;
    }

    .btn-primary {
      width: 100%;
    }
  }
</style>
