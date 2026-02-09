<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
  import { BOND_LEVEL_TOOLTIP } from '$lib/companions/companionCopy';

  type Companion = {
    id: string;
    name: string;
    species: string;
    avatar_url: string | null;
    bond_level: number;
    bond_xp: number;
    bond_next: number;
    mood: string;
  };

const fallbackAvatar = '/avatar.svg';

  export let companion: Companion | null = null;
  export let isOwner = false;
  export let busy = false;

  const dispatch = createEventDispatcher<{ swap: void }>();

  $: bondPercent =
    companion && companion.bond_next > 0
      ? Math.min(100, Math.round((companion.bond_xp / companion.bond_next) * 100))
      : 0;

  const handleSwap = () => {
    if (busy) return;
    dispatch('swap');
  };
</script>

<Panel title="Featured Companion" className="profile-panel profile-companion panel-glass">
  {#if companion}
    <div class="companion-card">
      <div class="avatar-wrap">
        <img
          class="avatar"
          src={companion.avatar_url ?? fallbackAvatar}
          alt={companion.name}
          loading="lazy"
          decoding="async"
        />
        <span class="mood-chip">{companion.mood}</span>
      </div>
      <div class="details">
        <div class="name-row">
          <div>
            <p class="label">Companion</p>
            <h3>{companion.name}</h3>
            <p class="species">{companion.species}</p>
          </div>
          {#if isOwner}
            <button type="button" class="ghost-btn" on:click={handleSwap} disabled={busy}>
              {busy ? 'Updating…' : 'Swap'}
            </button>
          {/if}
        </div>
        <div class="bond">
          <div class="label-with-hint">
            <p class="label">Bond level</p>
            <InfoTooltip text={BOND_LEVEL_TOOLTIP} label="Bond level explainer" />
          </div>
          <div class="bond-row">
            <span class="level-pill">Lv {companion.bond_level}</span>
            <span class="bond-meta">{companion.bond_xp}/{companion.bond_next} XP</span>
          </div>
          <div class="bond-bar" role="progressbar" aria-valuenow={bondPercent} aria-valuemin="0" aria-valuemax="100">
            <span class="bond-fill bond-glow" style={`width:${bondPercent}%`}></span>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="empty">
      {#if isOwner}
        <p>Invite your first companion to watch them on your profile.</p>
        <button type="button" class="ghost-btn" on:click={handleSwap} disabled={busy}>
          {busy ? 'Opening…' : 'Choose companion'}
        </button>
      {:else}
        <p>This explorer has not showcased a companion yet.</p>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  .companion-card {
    display: flex;
    gap: 1.25rem;
    align-items: stretch;
  }

  .avatar-wrap {
    position: relative;
    width: 120px;
    flex-shrink: 0;
  }

  .avatar {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 20px 40px rgba(5, 6, 18, 0.45);
    background: radial-gradient(circle at 30% 30%, rgba(94, 242, 255, 0.3), transparent 60%);
  }

  .mood-chip {
    position: absolute;
    bottom: -10px;
    left: 12px;
    padding: 0.3rem 0.9rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }

  .details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .name-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .label {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0 0 0.3rem;
  }

  h3 {
    margin: 0;
    font-size: 1.3rem;
  }

  .species {
    margin: 0.1rem 0 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .bond {
    display: grid;
    gap: 0.35rem;
  }

  .label-with-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .bond-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .bond-meta {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .level-pill {
    padding: 0.2rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(94, 242, 255, 0.45);
    font-size: 0.85rem;
  }

  .bond-bar {
    width: 100%;
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .bond-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.95));
    transition: width 200ms ease;
  }

  .ghost-btn {
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .ghost-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .empty {
    text-align: center;
    padding: 1rem 0;
    color: rgba(255, 255, 255, 0.7);
    display: grid;
    gap: 0.75rem;
  }

  @media (max-width: 640px) {
    .companion-card {
      flex-direction: column;
    }

    .avatar-wrap {
      width: 100%;
      display: flex;
      justify-content: center;
    }
  }
</style>
