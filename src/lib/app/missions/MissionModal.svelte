<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import Portal from '$lib/ui/Portal.svelte';
  import type { MissionRow } from '$lib/data/missions';
  import { activeCompanionBonus } from '$lib/stores/companions';

  export let mission: MissionRow | null = null;
  export let open = false;
  export let currentEnergy: number | null = null;
  export let activeSession: { sessionId: string; status: string; startedAt: string; cost?: { energy?: number } | null } | null = null;
  export let recentCompletion:
    | { sessionId: string; status: string; completedAt: string | null; rewards?: { xpGranted?: number; energyGranted?: number } | null }
    | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    refreshSessions: void;
  }>();

  type RuntimeState = 'idle' | 'starting' | 'in_progress' | 'completing' | 'completed';

  let modalEl: HTMLElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let runtimeState: RuntimeState = 'idle';
  let missionSessionId: string | null = null;
  let rewardsGranted: { xpGranted: number; energyGranted: number } | null = null;
  let friendlyError: string | null = null;
  $: bonus = $activeCompanionBonus;
  $: xpBoost = Math.round(((bonus?.xpMultiplier ?? 1) - 1) * 100);
  $: missionEnergyBonus = bonus?.missionEnergyBonus ?? 0;
  $: missionType =
    mission?.type === 'identity' || mission?.type === 'world' || mission?.type === 'action'
      ? mission.type
      : 'action';
  $: missionTypeLabel = missionType === 'identity' ? 'Identity' : missionType === 'world' ? 'World' : 'Action';
  $: missionTypeHint =
    missionType === 'identity' ? 'No cost' : missionType === 'world' ? 'Usually no cost' : 'Energy cost';
  $: energyCost = missionType === 'action' ? mission?.cost?.energy ?? 0 : null;
  $: hasInsufficientEnergy =
    missionType === 'action' &&
    typeof energyCost === 'number' &&
    energyCost > 0 &&
    typeof currentEnergy === 'number' &&
    currentEnergy < energyCost;
  $: startDisabled = runtimeState === 'starting' || runtimeState === 'completing';
  $: completeDisabled = runtimeState === 'starting' || runtimeState === 'completing';

  function close() {
    dispatch('close');
  }

  function resetRuntime() {
    runtimeState = 'idle';
    missionSessionId = null;
    rewardsGranted = null;
    friendlyError = null;
  }

  function syncRuntimeFromServerSession() {
    if (!open) return;
    if (activeSession?.sessionId) {
      missionSessionId = activeSession.sessionId;
      runtimeState = 'in_progress';
      return;
    }
    if (recentCompletion?.sessionId) {
      missionSessionId = recentCompletion.sessionId;
      rewardsGranted = {
        xpGranted: Math.max(0, Math.floor(recentCompletion.rewards?.xpGranted ?? 0)),
        energyGranted: Math.max(0, Math.floor(recentCompletion.rewards?.energyGranted ?? 0))
      };
      runtimeState = 'completed';
      return;
    }
    runtimeState = 'idle';
    missionSessionId = null;
    rewardsGranted = null;
  }

  function resolveFriendlyError(payload: Record<string, unknown> | null, fallback = 'Something went wrong. Please try again.') {
    const code = typeof payload?.error === 'string' ? payload.error : null;
    switch (code) {
      case 'unauthorized':
        return 'Please sign in again to continue this mission.';
      case 'mission_not_found':
        return 'This mission could not be found.';
      case 'mission_cooldown':
        return 'This mission is cooling down. Try again in a bit.';
      case 'mission_already_active':
        return 'This mission is already in progress.';
      case 'mission_already_done_daily':
        return 'You already completed this daily mission today.';
      case 'mission_already_done_weekly':
        return 'You already completed this weekly mission this week.';
      case 'insufficient_energy':
        return 'Not enough energy to start this mission yet.';
      case 'session_not_found':
        return 'This mission session is no longer available.';
      case 'session_not_active':
        return 'This mission session has already been completed.';
      case 'mission_too_early_to_complete':
        return 'This mission needs a little more time before completion.';
      default:
        return typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : fallback;
    }
  }

  async function startMission() {
    if (!mission?.id || startDisabled) return;
    runtimeState = 'starting';
    friendlyError = null;

    try {
      const res = await fetch('/api/missions/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId: mission.id })
      });
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        friendlyError = resolveFriendlyError(payload, 'Unable to start this mission right now.');
        runtimeState = 'idle';
        return;
      }

      const sessionId =
        typeof payload?.sessionId === 'string'
          ? payload.sessionId
          : typeof (payload?.session as Record<string, unknown> | undefined)?.id === 'string'
            ? ((payload?.session as Record<string, unknown>).id as string)
            : null;
      if (!sessionId) {
        friendlyError = 'Mission started, but we could not recover your session. Please try again.';
        runtimeState = 'idle';
        return;
      }

      missionSessionId = sessionId;
      runtimeState = 'in_progress';
      dispatch('refreshSessions');
    } catch (error) {
      friendlyError = 'Network issue while starting mission. Please try again.';
      runtimeState = 'idle';
    }
  }

  async function completeMission() {
    if (!mission?.id || !missionSessionId || completeDisabled) return;
    runtimeState = 'completing';
    friendlyError = null;

    try {
      const res = await fetch('/api/missions/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: missionSessionId, results: {} })
      });
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        friendlyError = resolveFriendlyError(payload, 'Unable to complete this mission right now.');
        runtimeState = 'in_progress';
        return;
      }

      const rewards = (payload?.rewardsGranted ?? payload?.rewards ?? null) as Record<string, unknown> | null;
      rewardsGranted = {
        xpGranted: typeof rewards?.xpGranted === 'number' ? Math.max(0, Math.floor(rewards.xpGranted)) : 0,
        energyGranted:
          typeof rewards?.energyGranted === 'number' ? Math.max(0, Math.floor(rewards.energyGranted)) : 0
      };
      runtimeState = 'completed';
      dispatch('refreshSessions');
    } catch (error) {
      friendlyError = 'Network issue while completing mission. Please try again.';
      runtimeState = 'in_progress';
    }
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      if (!focusable.length || !modalEl) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  async function focusModal() {
    if (!browser || !open) return;
    await tick();
    if (!modalEl) return;
    focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    );
    (focusable[0] ?? modalEl).focus();
  }

  $: if (browser) {
    if (open) {
      previouslyFocused = (document.activeElement as HTMLElement | null) ?? previouslyFocused;
      document.body.classList.add('modal-open');
      syncRuntimeFromServerSession();
      void focusModal();
    } else {
      document.body.classList.remove('modal-open');
      focusable = [];
      previouslyFocused?.focus?.();
      previouslyFocused = null;
      resetRuntime();
    }
  }

  onMount(() => {
    if (!browser) return;
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.classList.remove('modal-open');
    };
  });

  onDestroy(() => {
    if (!browser) return;
    document.body.classList.remove('modal-open');
  });
</script>

{#if browser && open && mission}
  <Portal target="#modal-root">
    <button
      type="button"
      class="fixed inset-0 z-[2147483646] bg-black/60 backdrop-blur-md transition-opacity"
      aria-label="Close mission dialog"
      on:click={close}
    ></button>

    <div
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-modal-title"
      aria-describedby="mission-modal-summary"
      class="fixed z-[2147483647] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
             w-[min(92vw,36rem)] max-h-[85vh] overflow-auto
             rounded-2xl border border-white/12 shadow-lg
             bg-slate-900/92 p-6 backdrop-blur-md space-y-5 text-slate-100"
    >
      <header class="space-y-2">
        <p class="text-xs uppercase tracking-[0.2em] text-sky-300/70">Mission briefing</p>
        <h2 id="mission-modal-title" class="text-2xl font-semibold text-slate-50">
          {mission.title ?? 'Mission'}
        </h2>
        <div class="type-row">
          <span class={`type-pill ${missionType}`}>{missionTypeLabel}</span>
          <span class="type-hint">{missionTypeHint}</span>
        </div>
      </header>

      {#if mission.summary}
        <p id="mission-modal-summary" class="text-[15px] leading-relaxed text-slate-200/90">
          {mission.summary}
        </p>
      {:else}
        <p id="mission-modal-summary" class="text-[15px] leading-relaxed text-slate-200/80">
          Get ready to dive into this mission. We&apos;ll restore your last progress when you launch.
        </p>
      {/if}

      {#if missionType === 'identity'}
        <p class="privacy-note">You control what Looma remembers.</p>
      {/if}

      {#if missionType === 'action'}
        <p class="action-cost">Energy cost: <strong>{energyCost}</strong></p>
      {/if}

      {#if runtimeState === 'in_progress'}
        <p class="mission-status mission-status--active">Status: Active</p>
      {:else if runtimeState === 'completed'}
        <p class="mission-status mission-status--completed">Status: Completed</p>
      {:else}
        <p class="mission-status">Status: Not started</p>
      {/if}

      {#if xpBoost > 0 || missionEnergyBonus > 0}
        <div class="companion-bonus">
          <span>Companion bonus:</span>
          {#if xpBoost > 0}
            <span>+{xpBoost}% XP</span>
          {/if}
          {#if missionEnergyBonus > 0}
            <span>+{missionEnergyBonus} mission energy cap</span>
          {/if}
        </div>
      {/if}

      <dl class="grid grid-cols-2 gap-3 text-sm text-slate-200/70">
        <div class="stat">
          <dt class="font-medium text-slate-300/90">Difficulty</dt>
          <dd class="text-slate-100/90">{mission.difficulty ?? 'Unknown'}</dd>
        </div>
        <div class="stat">
          <dt class="font-medium text-slate-300/90">Status</dt>
          <dd class="text-slate-100/90 capitalize">{mission.status ?? 'available'}</dd>
        </div>
        <div class="stat">
          <dt class="font-medium text-slate-300/90">Energy Reward</dt>
          <dd class="text-slate-100/90">{mission.energy_reward ?? 10}</dd>
        </div>
        <div class="stat">
          <dt class="font-medium text-slate-300/90">XP Reward</dt>
          <dd class="text-slate-100/90">{mission.xp_reward ?? 250}</dd>
        </div>
      </dl>

      {#if missionType === 'action'}
        <p class="reward-summary">
          Expected rewards: +{mission.energy_reward ?? 0} energy and +{mission.xp_reward ?? 0} XP.
        </p>
      {/if}

      {#if friendlyError}
        <p class="modal-error" role="alert">{friendlyError}</p>
      {/if}

      {#if missionSessionId}
        <p class="session-note">Session active: <code>{missionSessionId}</code></p>
      {/if}

      {#if runtimeState === 'completed'}
        <p class="reward-summary">
          Completed. Rewards granted:
          <strong>+{rewardsGranted?.xpGranted ?? 0} XP</strong>,
          <strong>+{rewardsGranted?.energyGranted ?? 0} energy</strong>.
        </p>
      {/if}

      {#if hasInsufficientEnergy && runtimeState === 'idle'}
        <p class="modal-error" role="alert">
          Not enough energy to start. You have {currentEnergy ?? 0}, need {energyCost ?? 0}.
        </p>
      {/if}

      <footer class="flex justify-end items-center gap-3 pt-3 border-t border-white/10">
        <button
          type="button"
          class="px-4 py-2 rounded-full border border-white/20 text-slate-200/90 hover:bg-white/10 transition"
          on:click={close}
        >
          Close
        </button>
        {#if runtimeState === 'idle'}
          <button
            type="button"
            class="px-5 py-2 rounded-full bg-gradient-to-r from-cyan-400/90 to-blue-500/90 text-slate-900 font-semibold shadow-lg hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 transition"
            on:click={startMission}
            disabled={startDisabled || hasInsufficientEnergy}
          >
            Start mission
          </button>
        {:else if runtimeState === 'starting'}
          <button
            type="button"
            class="px-5 py-2 rounded-full bg-slate-600/80 text-slate-100 font-semibold"
            disabled
          >
            Starting...
          </button>
        {:else if runtimeState === 'in_progress'}
          <button
            type="button"
            class="px-5 py-2 rounded-full bg-gradient-to-r from-emerald-400/90 to-teal-500/90 text-slate-900 font-semibold shadow-lg hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 transition"
            on:click={completeMission}
            disabled={completeDisabled}
          >
            Complete mission
          </button>
        {:else if runtimeState === 'completing'}
          <button
            type="button"
            class="px-5 py-2 rounded-full bg-slate-600/80 text-slate-100 font-semibold"
            disabled
          >
            Completing...
          </button>
        {:else}
          <button
            type="button"
            class="px-5 py-2 rounded-full bg-emerald-500/75 text-slate-950 font-semibold"
            disabled
          >
            Completed
          </button>
        {/if}
      </footer>
    </div>
  </Portal>
{/if}

<style>
  .stat {
    display: grid;
    gap: 4px;
  }

  .companion-bonus {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: rgba(125, 211, 252, 0.95);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 0.85rem;
    padding: 0.4rem 0.75rem;
    background: rgba(59, 130, 246, 0.08);
  }

  .type-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .type-pill {
    display: inline-flex;
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 0.2rem 0.62rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .type-pill.identity {
    border-color: rgba(196, 181, 253, 0.42);
    background: rgba(196, 181, 253, 0.16);
    color: rgba(237, 233, 254, 0.96);
  }

  .type-pill.action {
    border-color: rgba(251, 191, 36, 0.46);
    background: rgba(251, 191, 36, 0.16);
    color: rgba(254, 243, 199, 0.96);
  }

  .type-pill.world {
    border-color: rgba(34, 211, 238, 0.46);
    background: rgba(34, 211, 238, 0.16);
    color: rgba(207, 250, 254, 0.96);
  }

  .type-hint {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.86);
  }

  .privacy-note {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(224, 231, 255, 0.93);
  }

  .action-cost {
    margin: 0;
    font-size: 0.86rem;
    color: rgba(254, 240, 138, 0.95);
  }

  .action-cost strong {
    color: rgba(254, 243, 199, 0.98);
  }

  .reward-summary {
    margin: 0;
    font-size: 0.84rem;
    color: rgba(250, 245, 255, 0.95);
  }

  .modal-error {
    margin: 0;
    border: 1px solid rgba(248, 113, 113, 0.5);
    border-radius: 0.75rem;
    padding: 0.55rem 0.7rem;
    background: rgba(127, 29, 29, 0.24);
    color: rgba(254, 226, 226, 0.96);
    font-size: 0.84rem;
  }

  .session-note {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .session-note code {
    color: rgba(226, 232, 240, 0.95);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  }

  .mission-status {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(203, 213, 225, 0.9);
  }

  .mission-status--active {
    color: rgba(147, 197, 253, 0.98);
  }

  .mission-status--completed {
    color: rgba(134, 239, 172, 0.98);
  }
</style>
