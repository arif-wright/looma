<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import Portal from '$lib/ui/Portal.svelte';
  import type { MissionRow } from '$lib/data/missions';
  import { activeCompanionBonus } from '$lib/stores/companions';

  export let mission: MissionRow | null = null;
  export let open = false;

  const dispatch = createEventDispatcher<{
    close: void;
    launch: { missionId: string };
  }>();

  let modalEl: HTMLElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  $: bonus = $activeCompanionBonus;
  $: xpBoost = Math.round(((bonus?.xpMultiplier ?? 1) - 1) * 100);
  $: missionEnergyBonus = bonus?.missionEnergyBonus ?? 0;

  function close() {
    dispatch('close');
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
      void focusModal();
    } else {
      document.body.classList.remove('modal-open');
      focusable = [];
      previouslyFocused?.focus?.();
      previouslyFocused = null;
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

      <footer class="flex justify-end items-center gap-3 pt-3 border-t border-white/10">
        <button
          type="button"
          class="px-4 py-2 rounded-full border border-white/20 text-slate-200/90 hover:bg-white/10 transition"
          on:click={close}
        >
          Close
        </button>
        <button
          type="button"
          class="px-5 py-2 rounded-full bg-gradient-to-r from-cyan-400/90 to-blue-500/90 text-slate-900 font-semibold shadow-lg hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 transition"
          on:click={() => dispatch('launch', { missionId: mission.id })}
        >
          Resume Mission
        </button>
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
</style>
