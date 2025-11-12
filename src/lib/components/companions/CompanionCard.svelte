<script lang="ts">
import { createEventDispatcher } from 'svelte';
import type { CareAction, Companion } from '$lib/stores/companions';

export let companion: Companion;
export let busyAction: CareAction | null = null;
export let showActions = true;
export let compact = false;
export let context: 'care' | 'roster' = 'care';
export let stateLabel: string | null = null;
export let isActive = false;
export let slotIndex: number | null = null;
export let disabled = false;

  const dispatch = createEventDispatcher<{ care: CareAction; open: void }>();
  const fallbackAvatar = '/avatar.svg';

const careActions: Array<{ key: CareAction; label: string; emoji: string }> = [
    { key: 'feed', label: 'Feed', emoji: '🍓' },
    { key: 'play', label: 'Play', emoji: '🪁' },
    { key: 'groom', label: 'Groom', emoji: '✨' }
  ];

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  $: rosterState = (stateLabel ?? companion.state ?? companion.mood ?? 'idle') as string;

  const handleCare = (action: CareAction, event: MouseEvent) => {
    event.stopPropagation();
    if (busyAction || disabled) return;
    dispatch('care', action);
  };

  const openPanel = () => {
    if (disabled) return;
    dispatch('open');
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPanel();
    }
  };
</script>

<article
  class={`companion-card ${compact ? 'companion-card--compact' : ''} ${context === 'roster' ? 'companion-card--roster' : ''} ${
    isActive ? 'companion-card--active' : ''
  } ${disabled ? 'companion-card--disabled' : ''}`}
  data-test="companion-card"
  data-roster-card={context === 'roster' ? 'true' : undefined}
  data-roster-draggable={context === 'roster' && !disabled ? 'true' : undefined}
  on:click={openPanel}
  on:keydown={handleKey}
  tabindex={disabled ? -1 : 0}
  aria-disabled={disabled ? 'true' : undefined}
>
  <div class="card-media">
    <img src={companion.avatar_url ?? fallbackAvatar} alt={`${companion.name} avatar`} loading="lazy" />
    <span class="rarity-pill">{companion.rarity}</span>
    <span class="level-pill">Lv {companion.level}</span>
  </div>
  <div class="card-body">
  <div class="card-head">
    <div>
      <p class="eyebrow">{companion.species}</p>
      <h3>{companion.name}</h3>
    </div>
    <div class="mood-chip">{companion.mood}</div>
  </div>
  {#if context === 'roster'}
    <div class="roster-meta">
      <span class="roster-pill" aria-label={`State ${rosterState}`}>{rosterState}</span>
      {#if typeof slotIndex === 'number'}
        <span class="roster-slot">Slot {slotIndex + 1}</span>
      {/if}
      <button
        type="button"
        class="roster-handle"
        data-roster-handle
        aria-label="Reorder companion"
        disabled={disabled}
        on:click|stopPropagation
      >
        ☰
      </button>
    </div>
  {/if}
    <div class="metrics">
      <div class="metric">
        <span>Affection</span>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.affection)} aria-valuemin="0" aria-valuemax="100">
          <span class="fill" style={`width:${pct(companion.affection)}%`}></span>
        </div>
      </div>
      <div class="metric">
        <span>Trust</span>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.trust)} aria-valuemin="0" aria-valuemax="100">
          <span class="fill alt" style={`width:${pct(companion.trust)}%`}></span>
        </div>
      </div>
      <div class="metric">
        <span>Energy</span>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.energy)} aria-valuemin="0" aria-valuemax="100">
          <span class="fill warn" style={`width:${pct(companion.energy)}%`}></span>
        </div>
      </div>
    </div>
    {#if showActions}
      <div class="actions">
        {#each careActions as action}
          <button
            type="button"
            class={`care-btn ${busyAction === action.key ? 'busy' : ''}`}
            aria-label={`${action.label} ${companion.name}`}
            disabled={!!busyAction}
            on:click={(event) => handleCare(action.key, event)}
          >
            <span aria-hidden="true">{action.emoji}</span>
            <span>{busyAction === action.key ? 'Working…' : action.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</article>

<style>
  .companion-card {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 1.25rem;
    padding: 1.25rem;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: radial-gradient(circle at top, rgba(94, 242, 255, 0.09), transparent 65%), rgba(9, 11, 25, 0.85);
    box-shadow: 0 24px 45px rgba(5, 6, 18, 0.4);
    cursor: pointer;
    transition: transform 200ms ease, border-color 200ms ease;
  }

  .companion-card:focus-visible,
  .companion-card:hover {
    transform: translateY(-2px);
    border-color: rgba(94, 242, 255, 0.6);
    outline: none;
  }

  .companion-card--compact {
    grid-template-columns: 140px 1fr;
    padding: 1rem;
  }

  .companion-card--roster {
    position: relative;
    cursor: grab;
  }

  .companion-card--roster:active {
    cursor: grabbing;
  }

  .companion-card--active {
    border-color: rgba(95, 213, 255, 0.9);
    box-shadow: 0 0 0 2px rgba(95, 213, 255, 0.25), 0 22px 38px rgba(8, 16, 24, 0.7);
  }

  .companion-card--disabled {
    opacity: 0.6;
    cursor: not-allowed;
    pointer-events: none;
  }

  .card-media {
    position: relative;
  }

  .card-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    min-height: 180px;
  }

  .rarity-pill,
  .level-pill {
    position: absolute;
    left: 12px;
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(5, 6, 18, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .rarity-pill {
    top: 12px;
  }

  .level-pill {
    bottom: 12px;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.6);
  }

  h3 {
    margin: 0.15rem 0 0;
    font-size: 1.4rem;
  }

  .mood-chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    font-size: 0.85rem;
    text-transform: capitalize;
  }

  .companion-card--roster .mood-chip {
    text-transform: none;
  }

  .roster-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .roster-pill,
  .roster-slot {
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.06);
    text-transform: capitalize;
  }

  .roster-slot {
    text-transform: none;
  }

  .roster-handle {
    margin-left: auto;
    border: 1px dashed rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.9rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    cursor: grab;
  }

  .roster-handle:active {
    cursor: grabbing;
  }

  .roster-handle:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(95, 213, 255, 0.45);
  }

  .metrics {
    display: grid;
    gap: 0.7rem;
  }

  .metric span:first-child {
    display: block;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    margin-bottom: 0.2rem;
  }

  .meter {
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.95));
  }

  .fill.alt {
    background: linear-gradient(90deg, rgba(130, 255, 173, 0.9), rgba(46, 213, 115, 0.95));
  }

  .fill.warn {
    background: linear-gradient(90deg, rgba(255, 219, 116, 0.9), rgba(255, 148, 102, 0.95));
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .care-btn {
    flex: 1;
    min-width: 100px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 0.45rem 0.9rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .care-btn.busy {
    opacity: 0.6;
  }

  .care-btn:disabled {
    cursor: progress;
  }

  @media (max-width: 720px) {
    .companion-card {
      grid-template-columns: 1fr;
    }

    .card-media img {
      min-height: 220px;
    }
  }
</style>
