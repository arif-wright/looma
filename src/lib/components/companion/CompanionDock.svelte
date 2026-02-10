<script lang="ts">
  import { browser, dev } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { Eye, EyeOff, Sparkles, Sparkle, PanelRightOpen } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import ReactionBubble from '$lib/components/companion/ReactionBubble.svelte';
  import { sendEvent } from '$lib/client/events/sendEvent';
  import { pushCompanionReaction } from '$lib/stores/companionReactions';
  import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  import { registerPortraitCaptureHost } from '$lib/companions/portraitHost';
  import type { DerivedMoodKey } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';

  const STORAGE_VISIBLE = 'looma_companion_visible';
  const STORAGE_MOTION = 'looma_companion_motion';

  export let visible = true;
  export let motionEnabled = true;
  export let transparent = true;
  export let reactionsEnabled = true;
  export let companionId = 'muse';
  export let companionName = 'Muse';
  export let companionCosmetics: Record<string, string | number | boolean | null> | null = null;
  export let moodKey: DerivedMoodKey | null = null;

  let expanded = false;
  let localVisible = true;
  let localMotion = true;
  let museRef: MuseModel | null = null;
  let unregisterCaptureHost: (() => void) | null = null;
  let nowTick = Date.now();
  let nowTimer: number | null = null;

  const readBool = (value: string | null, fallback: boolean) => {
    if (value === null) return fallback;
    return value === 'true';
  };

  const persist = () => {
    if (!browser) return;
    window.localStorage.setItem(STORAGE_VISIBLE, String(localVisible));
    window.localStorage.setItem(STORAGE_MOTION, String(localMotion));
  };

  onMount(() => {
    if (!browser) return;
    localVisible = readBool(window.localStorage.getItem(STORAGE_VISIBLE), true);
    localMotion = readBool(window.localStorage.getItem(STORAGE_MOTION), true);

    nowTimer = window.setInterval(() => {
      nowTick = Date.now();
    }, 30_000);

    return () => {
      if (nowTimer) {
        window.clearInterval(nowTimer);
        nowTimer = null;
      }
    };
  });

  onDestroy(() => {
    unregisterCaptureHost?.();
    unregisterCaptureHost = null;
  });

  $: if (browser) {
    persist();
  }

  const toggleExpanded = () => {
    expanded = !expanded;
  };

  const toggleVisible = () => {
    localVisible = !localVisible;
    if (!localVisible) {
      expanded = false;
    }
  };

  const toggleMotion = () => {
    localMotion = !localMotion;
  };

  const triggerTestReaction = async () => {
    const response = await sendEvent('session.return', { source: 'dock_test' });
    const output = response?.output ?? null;
    if (!reactionsEnabled || output?.suppressed === true) return;
    const reaction = output?.reaction ?? null;
    if (reaction) {
      pushCompanionReaction(reaction);
    }
  };

  const normalizeCompanionId = (value: string) => value.trim().toLowerCase();

  $: activeCompanionId = normalizeCompanionId(companionId || 'muse');
  $: activeCompanionName = companionName?.trim() || 'Muse';
  $: activeCosmetics = normalizeCompanionCosmetics(companionCosmetics);
  $: effectiveMotion = motionEnabled && localMotion;
  $: museAnimation = pickMuseAnimationForMood(moodKey, { nowMs: nowTick, seed: activeCompanionId });

  $: if (browser) {
    unregisterCaptureHost?.();
    unregisterCaptureHost = registerPortraitCaptureHost(async () => {
      try {
        return (await museRef?.capturePortrait?.()) ?? null;
      } catch {
        return null;
      }
    });
  }
</script>

{#if visible}
  <div class="companion-dock" aria-live="polite">
    {#if localVisible}
      <div
        class={`companion-dock__panel ${expanded ? 'is-expanded' : ''}`}
        role="group"
        aria-label={`${activeCompanionName} companion dock`}
      >
      <div class="companion-dock__header">
        <div>
          <p class="companion-dock__eyebrow">Companion</p>
          <p class="companion-dock__title">{activeCompanionName}</p>
        </div>
        <button
          class="companion-dock__icon"
          type="button"
          on:click={toggleExpanded}
          aria-label={`Toggle ${activeCompanionName} dock`}
        >
          <PanelRightOpen size={16} />
        </button>
      </div>

      <div class="companion-dock__viewer">
        <MuseModel
          bind:this={museRef}
          size={expanded ? '184px' : '116px'}
          autoplay={effectiveMotion}
          cameraControls={false}
          respectReducedMotion={false}
          animationName={museAnimation}
          transparent={transparent}
          poster={undefined}
          cameraTarget={undefined}
          auraColor={activeCosmetics.auraColor}
          glowIntensity={activeCosmetics.glowIntensity}
        />
        {#if reactionsEnabled}
          <div class="companion-dock__reaction">
            <ReactionBubble />
          </div>
        {/if}
      </div>

      <div class="companion-dock__controls">
        <button type="button" class="companion-dock__toggle" on:click={toggleMotion} disabled={!motionEnabled}>
          {#if effectiveMotion}
            <Sparkles size={14} />
            Motion on
          {:else}
            <Sparkle size={14} />
            Motion off
          {/if}
        </button>
        <button type="button" class="companion-dock__toggle" on:click={toggleVisible}>
          <EyeOff size={14} />
          Hide
        </button>
        {#if dev}
          <button type="button" class="companion-dock__toggle" on:click={triggerTestReaction} disabled={!reactionsEnabled}>
            Test reaction
          </button>
        {/if}
      </div>

        <p class="companion-dock__hint">{activeCompanionName} is with you. More companion behaviors coming soon.</p>
      </div>
    {:else}
      <button
        class="companion-dock__restore"
        type="button"
        on:click={toggleVisible}
        aria-label={`Show ${activeCompanionName} dock`}
      >
        <Eye size={16} />
        {activeCompanionName}
      </button>
    {/if}
  </div>
{/if}

<style>
  .companion-dock {
    position: fixed;
    right: 0.6rem;
    bottom: 5.5rem;
    z-index: 40;
    pointer-events: none;
  }

  .companion-dock--hidden {
    pointer-events: none;
  }

  .companion-dock__panel,
  .companion-dock__restore {
    pointer-events: auto;
  }

  .companion-dock__panel {
    width: 220px;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(6, 10, 20, 0.85);
    box-shadow: 0 20px 50px rgba(4, 8, 20, 0.55);
    padding: 0.85rem;
    display: grid;
    gap: 0.7rem;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .companion-dock__panel.is-expanded {
    transform: translateY(-6px);
    box-shadow: 0 26px 60px rgba(4, 8, 20, 0.65);
  }

  .companion-dock__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .companion-dock__eyebrow {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .companion-dock__title {
    margin: 0.2rem 0 0;
    font-size: 0.94rem;
    font-weight: 600;
  }

  .companion-dock__icon {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 28, 0.75);
    padding: 0.3rem;
  }

  .companion-dock__viewer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
  }

  .companion-dock__reaction {
    width: 100%;
    display: flex;
    justify-content: center;
    pointer-events: auto;
  }

  .companion-dock__controls {
    display: grid;
    gap: 0.4rem;
  }

  .companion-dock__toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(9, 12, 25, 0.8);
    padding: 0.35rem 0.8rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.75);
  }

  .companion-dock__toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .companion-dock__hint {
    margin: 0;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .companion-dock__restore {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(9, 12, 25, 0.85);
    padding: 0.4rem 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.75rem;
  }

  @media (max-width: 720px) {
    .companion-dock {
      right: auto;
      left: 50%;
      transform: translateX(-50%);
      bottom: 6.5rem;
    }

    .companion-dock__panel {
      width: min(208px, calc(100vw - 1rem));
    }

  }
</style>
