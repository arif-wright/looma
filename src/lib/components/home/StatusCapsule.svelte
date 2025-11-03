<script lang="ts">
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let notifications: number | null = null;
  export let walletBalance: number | null = null;
  export let walletCurrency: string = 'shards';
  export let walletDelta: number | null = null;
  export let className = '';

let pulse = false;
let previousXp: number | null = null;

$: xpPercent =
    xpNext && xpNext > 0 && typeof xp === 'number'
      ? Math.min(100, Math.round((xp / xpNext) * 100))
      : null;

  $: energyPercent =
    energyMax && energyMax > 0 && typeof energy === 'number'
      ? Math.min(100, Math.round((energy / energyMax) * 100))
      : null;

  $: walletDisplay =
    typeof walletBalance === 'number' && Number.isFinite(walletBalance)
      ? walletBalance.toLocaleString()
      : '—';

  $: walletDeltaDisplay =
    typeof walletDelta === 'number' && Number.isFinite(walletDelta) && walletDelta !== 0
      ? `${walletDelta > 0 ? '+' : ''}${walletDelta.toLocaleString()}`
      : null;

  $: walletDeltaSign =
    typeof walletDelta === 'number' && Number.isFinite(walletDelta) && walletDelta !== 0
      ? walletDelta > 0
        ? 'positive'
        : 'negative'
      : null;

  $: walletCurrencyLabel =
    walletDisplay !== '—' && typeof walletCurrency === 'string'
      ? walletCurrency.toUpperCase()
      : '';

  $: if (typeof xp === 'number' && previousXp !== null && xp > previousXp) {
    triggerPulse();
  }

  $: previousXp = typeof xp === 'number' ? xp : previousXp;

  function triggerPulse() {
    pulse = true;
    const timeout = setTimeout(() => {
      pulse = false;
    }, 1600);
    return () => clearTimeout(timeout);
  }

</script>

<aside class={`status-capsule ${pulse ? 'level-up' : ''} ${className}`.trim()} aria-label="Status summary">
  <div class="status-line">
  <div class="stat level-stat">
    <strong class="value">
      <span class="value-label">Level</span>
      <span class="value-number">{level ?? '—'}</span>
    </strong>
  </div>
    <div class="metric">
      <span class="metric-label">Bond XP</span>
      <div class="meter" role="progressbar" aria-valuenow={xpPercent ?? undefined} aria-valuemin="0" aria-valuemax="100">
        <span style={`width:${xpPercent ?? 0}%`}></span>
      </div>
      <p class="metric-sub">
        {#if xp !== null && xpNext !== null}
          {xp} / {xpNext}
        {:else}
          Aligning…
        {/if}
      </p>
    </div>
  </div>

  <div class="status-line">
    <div class="stat">
      <span class="label">Energy</span>
      <strong class="value">
        {#if typeof energy === 'number' && typeof energyMax === 'number'}
          {energy}/{energyMax}
        {:else}
          —
        {/if}
      </strong>
    </div>
    <div class="metric">
      <span class="metric-label">Charge</span>
      <div class="meter" role="progressbar" aria-valuenow={energyPercent ?? undefined} aria-valuemin="0" aria-valuemax="100">
        <span style={`width:${energyPercent ?? 0}%`}></span>
      </div>
      <p class="metric-sub">
        {#if energyPercent !== null}
          {energyPercent}%
        {:else}
          Calibrating…
        {/if}
      </p>
    </div>
  </div>

  <div class="wallet-line">
    <div class="wallet">
      <span class="label">Wallet</span>
      <div class="pill wallet-pill" aria-live="polite">
        <span class="pill-icon" aria-hidden="true">💎</span>
        <span class="pill-text">
          {walletDisplay} {walletCurrencyLabel}
        </span>
        {#if walletDeltaDisplay && walletDeltaSign}
          <span class={`delta ${walletDeltaSign}`}>{walletDeltaDisplay}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="notifications">
    <span class="label">Signals</span>
    <div class="pill" data-count={notifications ?? 0}>
      <span class="dot" aria-hidden="true"></span>
      <span class="pill-text">
        {#if (notifications ?? 0) > 0}
          {notifications} unread
        {:else}
          All clear
        {/if}
      </span>
    </div>
  </div>
</aside>

<style>
  .status-capsule {
    display: grid;
    gap: 18px;
    min-height: 220px;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .stat {
    min-width: 80px;
    display: grid;
    gap: 6px;
  }

  .label {
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.55);
  }

  .value {
    font-size: 1.55rem;
    font-weight: 500;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
    color: rgba(244, 247, 255, 0.82);
    line-height: 1.1;
  }

  .level-stat .value {
    display: inline-flex;
    align-items: baseline;
    gap: 0.45rem;
    font-size: 1rem;
    font-family: inherit;
    color: rgba(226, 232, 255, 0.75);
  }

  .value-label {
    font-size: 1rem;
    font-weight: 500;
    color: rgba(226, 232, 255, 0.78);
  }

  .value-number {
    font-size: 1.55rem;
    font-weight: 500;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
    color: rgba(244, 247, 255, 0.85);
    letter-spacing: 0.02em;
  }

  .metric {
    flex: 1;
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .metric-label {
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.6);
  }

  .meter {
    position: relative;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--looma-accent, linear-gradient(90deg, #9b5cff, #4df4ff));
    transform-origin: left center;
    transition: width 400ms ease;
  }

  .metric-sub {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(226, 232, 255, 0.8);
  }

  .notifications {
    display: grid;
    gap: 8px;
  }

  .wallet-line {
    display: grid;
    gap: 8px;
  }

  .wallet {
    display: grid;
    gap: 6px;
  }

  .wallet-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(244, 247, 255, 0.9);
    font-size: 0.85rem;
  }

  .wallet-pill .pill-icon {
    font-size: 1rem;
  }

  .wallet-pill .pill-text {
    font-weight: 600;
  }

  .wallet-pill .delta {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .wallet-pill .delta.positive {
    color: #5bf5c6;
  }

  .wallet-pill .delta.negative {
    color: #fca5a5;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 12px 24px rgba(8, 10, 28, 0.4);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }

  .pill:hover,
  .pill:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 18px 36px rgba(77, 244, 255, 0.26);
  }

  .pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 18px 36px rgba(77, 244, 255, 0.26);
  }

  .dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: rgba(77, 244, 255, 0.95);
    box-shadow: 0 0 12px rgba(77, 244, 255, 0.6);
  }

  .pill-text {
    font-size: 0.9rem;
    color: rgba(244, 247, 255, 0.88);
  }

  .status-capsule.level-up {
    box-shadow: 0 0 0 0 rgba(155, 92, 255, 0.4), 0 24px 40px rgba(9, 10, 26, 0.45);
    animation: glow 1.6s ease-out;
  }

  @keyframes glow {
    0% {
      box-shadow: 0 0 0 0 rgba(155, 92, 255, 0.45), 0 24px 40px rgba(9, 10, 26, 0.45);
    }

    70% {
      box-shadow: 0 0 0 20px rgba(155, 92, 255, 0), 0 24px 40px rgba(9, 10, 26, 0.45);
    }

    100% {
      box-shadow: 0 0 0 0 rgba(155, 92, 255, 0), 0 24px 40px rgba(9, 10, 26, 0.45);
    }
  }

  @media (max-width: 1024px) {
    .status-capsule {
      min-height: initial;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }

    .status-capsule.level-up {
      animation: none;
    }
  }
</style>
