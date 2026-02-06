<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Eye, EyeOff, Sparkles, Sparkle, PanelRightOpen } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import ReactionToast from '$lib/components/companion/ReactionToast.svelte';

  const STORAGE_VISIBLE = 'looma_companion_visible';
  const STORAGE_MOTION = 'looma_companion_motion';

  export let visible = true;
  export let motionEnabled = true;
  export let transparent = true;
  export let reactionsEnabled = true;

  let expanded = false;
  let localVisible = true;
  let localMotion = false;

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
    localMotion = readBool(window.localStorage.getItem(STORAGE_MOTION), false);
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

$: effectiveMotion = motionEnabled && localMotion;
</script>

{#if visible}
  <div class="companion-dock" aria-live="polite">
    {#if localVisible}
      <div
        class={`companion-dock__panel ${expanded ? 'is-expanded' : ''}`}
        role="group"
        aria-label="Muse companion dock"
        on:mouseenter={() => (expanded = true)}
        on:mouseleave={() => (expanded = false)}
      >
      <div class="companion-dock__header">
        <div>
          <p class="companion-dock__eyebrow">Companion</p>
          <p class="companion-dock__title">Muse</p>
        </div>
        <button class="companion-dock__icon" type="button" on:click={toggleExpanded} aria-label="Toggle Muse dock">
          <PanelRightOpen size={16} />
        </button>
      </div>

      <div class="companion-dock__viewer">
        <MuseModel
          size={expanded ? '220px' : '140px'}
          autoplay={effectiveMotion && expanded}
          cameraControls={expanded}
          respectReducedMotion={false}
          animationName="Idle"
          transparent={transparent}
        />
        {#if reactionsEnabled}
          <div class="companion-dock__reaction">
            <ReactionToast />
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
      </div>

        <p class="companion-dock__hint">Hover to expand. Motion plays only when expanded.</p>
      </div>
    {:else}
      <button class="companion-dock__restore" type="button" on:click={toggleVisible} aria-label="Show Muse dock">
        <Eye size={16} />
        Muse
      </button>
    {/if}
  </div>
{/if}

<style>
  .companion-dock {
    position: fixed;
    right: 1.5rem;
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
    width: 260px;
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(6, 10, 20, 0.85);
    box-shadow: 0 20px 50px rgba(4, 8, 20, 0.55);
    padding: 1rem;
    display: grid;
    gap: 0.85rem;
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
    font-size: 1rem;
    font-weight: 600;
  }

  .companion-dock__icon {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 28, 0.75);
    padding: 0.3rem;
  }

  .companion-dock__viewer {
    display: grid;
    place-items: center;
    position: relative;
  }

  .companion-dock__reaction {
    position: absolute;
    bottom: -0.4rem;
    left: 50%;
    transform: translate(-50%, 100%);
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
    font-size: 0.75rem;
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
      right: 1rem;
      bottom: 6.5rem;
    }

    .companion-dock__panel {
      width: 230px;
    }
  }
</style>
