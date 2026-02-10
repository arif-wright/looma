<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { MoreVertical, Eye, EyeOff, Sparkles, Sparkle } from 'lucide-svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { companionPrefs, updateCompanionPrefs } from '$lib/stores/companionPrefs';
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
  import type { CompanionEffectiveState } from '$lib/companions/effectiveState';

  export let companion: ActiveCompanionSnapshot | null = null;
  export let effective: CompanionEffectiveState | null = null;
  export let onOpen: (() => void) | null = null;

  const dispatch = createEventDispatcher<{ open: void }>();

  let sheetOpen = false;
  const DEFAULT_AVATAR = '/avatar.svg';

  const open = () => {
    if (onOpen) {
      onOpen();
    } else {
      dispatch('open');
    }
  };

  const toggleMotion = () => updateCompanionPrefs({ motion: !$companionPrefs.motion });
  const toggleVisible = () => updateCompanionPrefs({ visible: !$companionPrefs.visible });

  const moodLine = () => {
    if (!companion) return 'Choose a companion to travel beside you.';
    const label = effective?.moodLabel ?? 'Steady';
    const energy = typeof effective?.energy === 'number' ? `Energy ${Math.round(effective.energy)}%` : null;
    return energy ? `${label} · ${energy}` : label;
  };

  $: companionName = companion?.name ?? 'Companion';
  $: effectiveMotion = $companionPrefs.motion;
  $: avatarSrc = companion?.avatar_url ?? DEFAULT_AVATAR;
</script>

<div class="dock" aria-label="Companion dock">
  {#if !$companionPrefs.visible}
    <div class="dock-hidden">
      <div class="dock-hidden__copy">
        <p class="dock-hidden__label">Companion hidden</p>
        <p class="dock-hidden__meta">Show your dock anytime.</p>
      </div>
      <button class="dock-hidden__btn" type="button" on:click={toggleVisible} aria-label="Show companion dock">
        <Eye size={16} />
        Show
      </button>
    </div>
  {:else}
    <div class="dock-panel" role="group" aria-label="Companion preview">
      <button type="button" class="dock-main" on:click={open} aria-label="Open companion">
        <div class="dock-avatar" aria-hidden="true">
          <img class="dock-avatar__img" src={avatarSrc} alt="" loading="lazy" decoding="async" />
        </div>
        <div class="dock-copy">
          <p class="dock-copy__name">{companion ? companionName : 'No active companion'}</p>
          <p class="dock-copy__meta">{moodLine()}</p>
        </div>
      </button>

      <div class="dock-actions" aria-label="Companion actions">
        <button class="dock-cta" type="button" on:click={open} disabled={!companion}>
          Check in
        </button>
        <button
          class="dock-more"
          type="button"
          aria-label="Companion settings"
          on:click={() => (sheetOpen = true)}
        >
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  {/if}
</div>

<BottomSheet
  open={sheetOpen}
  title="Companion"
  onClose={() => {
    sheetOpen = false;
  }}
>
  <div class="sheet">
    <div class="sheet-row">
      <div class="sheet-row__copy">
        <p class="sheet-row__title">Motion</p>
        <p class="sheet-row__meta">Animate companion moments across the app.</p>
      </div>
      <button type="button" class="sheet-row__btn" on:click={toggleMotion} aria-label="Toggle motion">
        {#if $companionPrefs.motion}
          <Sparkles size={16} />
          On
        {:else}
          <Sparkle size={16} />
          Off
        {/if}
      </button>
    </div>

    <div class="sheet-row">
      <div class="sheet-row__copy">
        <p class="sheet-row__title">Dock</p>
        <p class="sheet-row__meta">Hide the dock in your feed.</p>
      </div>
      <button type="button" class="sheet-row__btn" on:click={toggleVisible} aria-label="Toggle dock visibility">
        {#if $companionPrefs.visible}
          <EyeOff size={16} />
          Hide
        {:else}
          <Eye size={16} />
          Show
        {/if}
      </button>
    </div>
  </div>
</BottomSheet>

<style>
  .dock {
    width: 100%;
  }

  .dock-panel,
  .dock-hidden {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 0.9rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(10, 14, 32, 0.48);
    box-shadow: 0 18px 38px rgba(8, 15, 30, 0.35);
    backdrop-filter: blur(16px);
  }

  .dock-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .dock-avatar {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    overflow: hidden;
    flex: 0 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.45);
    box-shadow: 0 0 18px rgba(94, 242, 255, 0.08);
    display: grid;
    place-items: center;
  }

  .dock-avatar__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .dock-copy {
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }

  .dock-copy__name {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-copy__meta {
    margin: 0;
    font-size: 0.84rem;
    color: rgba(226, 232, 240, 0.65);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .dock-cta {
    height: 44px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(94, 234, 212, 0.22);
    background: rgba(12, 20, 28, 0.55);
    color: rgba(236, 254, 255, 0.92);
    font-size: 0.82rem;
  }

  .dock-cta:disabled {
    opacity: 0.55;
  }

  .dock-more {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.55);
    color: rgba(248, 250, 252, 0.9);
  }

  .dock-hidden__copy {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  .dock-hidden__label {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.92);
  }

  .dock-hidden__meta {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.65);
  }

  .dock-hidden__btn {
    height: 44px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.55);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: rgba(248, 250, 252, 0.9);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .sheet {
    display: grid;
    gap: 0.75rem;
  }

  .sheet-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 0.95rem;
    border-radius: 1.1rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 32, 0.35);
  }

  .sheet-row__copy {
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }

  .sheet-row__title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.92);
  }

  .sheet-row__meta {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.65);
  }

  .sheet-row__btn {
    height: 44px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.55);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: rgba(248, 250, 252, 0.9);
    font-size: 0.82rem;
    white-space: nowrap;
  }
</style>
