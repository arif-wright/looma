<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CareAction, Companion, CompanionStats } from '$lib/stores/companions';
  import CooldownBadge from './CooldownBadge.svelte';

  export let companion: Companion;
  export let stats: CompanionStats | null | undefined = null;
  export let busyAction: CareAction | null = null;
  export let error: string | null = null;

  const dispatch = createEventDispatcher<{ care: CareAction }>();
  const COOLDOWN_MS = 10 * 60 * 1000;

  const careActions: Array<{ key: CareAction; label: string; emoji: string; field: 'fed_at' | 'played_at' | 'groomed_at' }> = [
    { key: 'feed', label: 'Feed', emoji: '🍓', field: 'fed_at' },
    { key: 'play', label: 'Play', emoji: '🪁', field: 'played_at' },
    { key: 'groom', label: 'Groom', emoji: '✨', field: 'groomed_at' }
  ];

  const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

  const formatDistance = (iso: string | null | undefined) => {
    if (!iso) return 'Never';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return '—';
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const remainingMs = (iso: string | null | undefined) => {
    if (!iso) return 0;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 0;
    const elapsed = Date.now() - ts;
    return Math.max(0, COOLDOWN_MS - elapsed);
  };

  type CooldownMap = Record<CareAction, number>;

  $: cooldowns = {
    feed: remainingMs(stats?.fed_at ?? null),
    play: remainingMs(stats?.played_at ?? null),
    groom: remainingMs(stats?.groomed_at ?? null)
  } satisfies CooldownMap;

  const handleCare = (action: CareAction) => {
    if (busyAction) return;
    dispatch('care', action);
  };
</script>

<section class="care-panel">
  <p class="sr-announcer" aria-live="polite">
    {companion.name} stats — affection {pct(companion.affection)}%, trust {pct(companion.trust)}%, energy {pct(companion.energy)}%
  </p>
  <header>
    <div>
      <p class="eyebrow">Bonding</p>
      <h2>Care for {companion.name}</h2>
    </div>
    <div class="streak-pill">
      <span>Streak</span>
      <strong>{stats?.care_streak ?? 0}d</strong>
    </div>
  </header>

  {#if error}
    <div class="error" role="alert">{error}</div>
  {/if}

  <div class="panels">
    <div class="panel-block">
      <p class="label">Vitals</p>
      <div class="meters">
        <label>
          <span>Affection</span>
          <div class="meter" role="progressbar" aria-valuenow={pct(companion.affection)} aria-valuemin="0" aria-valuemax="100">
            <span class="fill" style={`width:${pct(companion.affection)}%`}></span>
          </div>
        </label>
        <label>
          <span>Trust</span>
          <div class="meter" role="progressbar" aria-valuenow={pct(companion.trust)} aria-valuemin="0" aria-valuemax="100">
            <span class="fill alt" style={`width:${pct(companion.trust)}%`}></span>
          </div>
        </label>
        <label>
          <span>Energy</span>
          <div class="meter" role="progressbar" aria-valuenow={pct(companion.energy)} aria-valuemin="0" aria-valuemax="100">
            <span class="fill warn" style={`width:${pct(companion.energy)}%`}></span>
          </div>
        </label>
      </div>
    </div>
    <div class="panel-block">
      <p class="label">Recent care</p>
      <ul>
        <li><strong>Fed:</strong> {formatDistance(stats?.fed_at ?? null)}</li>
        <li><strong>Played:</strong> {formatDistance(stats?.played_at ?? null)}</li>
        <li><strong>Groomed:</strong> {formatDistance(stats?.groomed_at ?? null)}</li>
      </ul>
    </div>
  </div>

  <div class="actions">
    {#each careActions as action}
      {#key action.key}
        <button
          type="button"
          class={`care-act ${busyAction === action.key ? 'busy' : ''}`}
          disabled={!!busyAction || cooldowns[action.key] > 0}
          on:click={() => handleCare(action.key)}
        >
          <span aria-hidden="true">{action.emoji}</span>
          <div class="care-act__copy">
            <span class="label">{action.label}</span>
            <CooldownBadge seconds={Math.ceil(cooldowns[action.key] / 1000)} busy={busyAction === action.key} />
          </div>
        </button>
      {/key}
    {/each}
  </div>
</section>

<style>
  .care-panel {
    display: grid;
    gap: 1rem;
    position: relative;
  }

  .sr-announcer {
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

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .eyebrow {
    margin: 0;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  h2 {
    margin: 0.2rem 0 0;
  }

  .streak-pill {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .streak-pill span {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.6);
  }

  .streak-pill strong {
    font-size: 1.1rem;
  }

  .error {
    border-radius: 16px;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.15);
    padding: 0.65rem 0.9rem;
    font-size: 0.9rem;
    color: rgb(254, 226, 226);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .panel-block {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .panel-block .label {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.65);
  }

  .meters {
    display: grid;
    gap: 0.75rem;
  }

  label span {
    display: block;
    margin-bottom: 0.2rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.68);
  }

  .meter {
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    overflow: hidden;
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

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
  }

  ul strong {
    font-weight: 600;
  }

  .actions {
    display: grid;
    gap: 0.75rem;
  }

  .care-act {
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 0.8rem;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .care-act__copy {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .care-act:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .care-act.busy {
    background: rgba(94, 242, 255, 0.12);
    border-color: rgba(94, 242, 255, 0.45);
  }
</style>
