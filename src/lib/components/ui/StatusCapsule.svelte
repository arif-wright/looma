<script lang="ts">
import { onDestroy } from 'svelte';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';

  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let unreadCount = 0;
  export let notifications: NotificationItem[] = [];
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};
  export let className = '';
  export let walletBalance: number | null = null;
  export let walletCurrency = 'SHARDS';
  export let walletDelta: number | null = null;

let walletPulse = false;
let lastBalance: number | null = null;
let pulseTimer: ReturnType<typeof setTimeout> | null = null;
const openWallet = (event: MouseEvent) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  window.location.assign('/app/wallet');
};

  const capsuleBaseClass =
    'status-pill panel-glass ring-neon flex w-full flex-wrap items-center gap-3 px-4 py-2 text-[13px] text-white/85 backdrop-blur-xl';

  let energyDisplay = '—';
  let levelDisplay: string | number = '—';
  let xpDisplay = 'Aligning…';
  let xpRatio = 0;

  const initials =
    userEmail && userEmail.length > 0 ? userEmail.charAt(0).toUpperCase() : '•';

  $: {
    const numeric = typeof walletBalance === 'number' ? walletBalance : null;
    if (numeric !== null && lastBalance !== null && numeric !== lastBalance) {
      walletPulse = true;
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => {
        walletPulse = false;
      }, 1500);
    }
    if (numeric !== null) {
      lastBalance = numeric;
    }
  }

  $: energyDisplay =
    typeof energy === 'number' && typeof energyMax === 'number'
      ? `${energy}/${energyMax}`
      : '—';

  $: levelDisplay = typeof level === 'number' ? level : '—';

  $: xpDisplay =
    typeof xp === 'number' && typeof xpNext === 'number' ? `${xp}/${xpNext}` : 'Aligning…';

  $: xpRatio =
    typeof xp === 'number' && typeof xpNext === 'number' && xpNext > 0
      ? Math.min(100, Math.max(0, (xp / xpNext) * 100))
      : 0;

  onDestroy(() => {
    if (pulseTimer) clearTimeout(pulseTimer);
  });
</script>

<div class={`${capsuleBaseClass} ${className}`.trim()} data-testid="top-status">
  <div class="stat stat--xp" aria-label="Bond level progress">
    <div class="stat-label">
      <span class="text-white/75">Level</span>
      <strong> {levelDisplay}</strong>
    </div>
    <div
      class="xp-meter"
      role="progressbar"
      aria-valuemin="0"
      aria-valuenow={Math.round(xpRatio)}
      aria-valuemax="100"
    >
      <span style={`width:${xpRatio}%`}></span>
    </div>
    <span class="stat-meta">{xpDisplay}</span>
  </div>

  <span aria-hidden="true" class="divider">•</span>

  <span class="stat stat--energy" aria-label="Current energy">
    <span aria-hidden="true">⚡</span>
    {energyDisplay}
  </span>

  <span aria-hidden="true" class="divider">•</span>

  <a
    class={`wallet-pill ${walletPulse ? 'pulse-soft' : ''}`.trim()}
    data-testid="header-wallet-pill"
    aria-live="polite"
    data-ana="nav:wallet"
    href="/app/wallet"
    on:click={openWallet}
  >
    <span aria-hidden="true">💎</span>
    <span>
      {#if typeof walletBalance === 'number'}
        {walletBalance.toLocaleString()}
      {:else}
        —
      {/if}
      {` ${walletCurrency.toUpperCase()}`}
    </span>
    {#if typeof walletDelta === 'number' && walletDelta !== 0}
      <span class={`wallet-delta ${walletDelta > 0 ? 'positive' : 'negative'}`}>
        {walletDelta > 0 ? '+' : '−'}{Math.abs(walletDelta).toLocaleString()}
      </span>
    {/if}
  </a>

  <span aria-hidden="true" class="divider">•</span>

  <NotificationBell
    class="shrink-0"
    notifications={notifications}
    unreadCount={unreadCount}
    data-ana="nav:notifications"
  />

  <span aria-hidden="true" class="divider">•</span>

  <button
    type="button"
    class="account-pill"
    on:click={onLogout}
    aria-label={userEmail ? `Account menu for ${userEmail}` : 'Open account menu'}
  >
    <span
      class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-aura-cyan/40 to-aura-violet/40 text-xs font-semibold uppercase tracking-wide text-ink-900 md:h-7 md:w-7"
      aria-hidden="true"
    >
      {initials}
    </span>
    {#if userEmail}
      <span class="max-w-[140px] truncate text-xs text-white/75">{userEmail}</span>
    {/if}
  </button>
</div>

<style>
  .status-pill {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(8, 12, 28, 0.6);
    box-shadow: 0 20px 35px rgba(2, 4, 12, 0.55);
    pointer-events: auto;
  }

  .stat {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: rgba(248, 250, 255, 0.9);
    white-space: nowrap;
  }

  .stat--xp {
    flex-direction: column;
    align-items: flex-start;
    min-width: 140px;
  }

  .stat-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: rgba(248, 250, 255, 0.7);
  }

  .stat-label strong {
    font-size: 0.9rem;
    color: #fff;
    margin-left: 0.35rem;
  }

  .xp-meter {
    width: 120px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
    position: relative;
  }

  .xp-meter span {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.9));
    transition: width 0.7s ease-out;
  }

  .stat-meta {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }

  .stat--energy {
    font-weight: 600;
    font-size: 0.85rem;
    gap: 0.35rem;
  }

  .divider {
    color: rgba(255, 255, 255, 0.28);
  }

  .wallet-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.9rem;
    border-radius: var(--brand-radius);
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.82rem;
    color: rgba(247, 249, 255, 0.9);
    cursor: pointer;
    pointer-events: auto;
    text-decoration: none;
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    border-width: 1px;
    position: relative;
    z-index: 1;
  }

  .wallet-pill:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.24);
  }

  .wallet-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  .wallet-delta {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .wallet-delta.positive {
    color: var(--brand-cyan, #5ef2ff);
  }

  .wallet-delta.negative {
    color: var(--brand-magenta, #ff4fd8);
  }

  .account-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    padding: 0.15rem 0.5rem;
    font-size: 0.78rem;
    color: #fff;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .account-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.4);
  }

  .account-pill:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.24);
  }

  .account-pill span:first-child {
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.6), rgba(155, 92, 255, 0.6));
    color: rgba(4, 7, 18, 0.9);
    font-weight: 700;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @media (max-width: 768px) {
    .status-pill {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .divider {
      display: none;
    }

    .stat--xp {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .xp-meter span {
      transition: none;
    }
  }
</style>
