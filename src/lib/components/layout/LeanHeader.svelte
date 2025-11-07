<script lang="ts">
  import { goto } from '$app/navigation';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import CenterIconNav, { type IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';

  export let iconNavItems: IconNavItem[] = [];
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let walletBalance: number | null = null;
  export let walletCurrency = 'SHARDS';
  export let notifications: NotificationItem[] = [];
  export let unreadCount = 0;
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};

  $: levelLabel = typeof level === 'number' ? level : '—';
  $: xpPct = typeof xp === 'number' && typeof xpNext === 'number' && xpNext > 0
    ? Math.min(100, Math.round((xp / xpNext) * 100))
    : 0;
  $: xpLabel = typeof xp === 'number' && typeof xpNext === 'number'
    ? `${xp}/${xpNext}`
    : 'Aligning…';
  $: energyLabel = typeof energy === 'number' && typeof energyMax === 'number'
    ? `${energy}/${energyMax}`
    : '—';
  $: shardLabel = typeof walletBalance === 'number'
    ? `${walletBalance.toLocaleString()} ${walletCurrency.toUpperCase()}`
    : `0 ${walletCurrency.toUpperCase()}`;
  $: initials = userEmail && userEmail.length > 0 ? userEmail.charAt(0).toUpperCase() : '•';

  const navWallet = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    goto('/app/wallet');
  };
</script>

<header class="lean-header" data-testid="lean-header">
  <div class="lean-header__inner">
    <div class="lean-header__left">
      <a href="/app/home" class="lean-logo" aria-label="Go home">
        <span class="lean-logo__mark" aria-hidden="true"></span>
        <span class="lean-logo__word">Looma</span>
      </a>
      <label class="lean-search" role="search" aria-label="Search Looma">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="lean-search__icon" aria-hidden="true">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
        </svg>
        <input type="search" placeholder="Search Looma" aria-label="Search Looma" />
      </label>
    </div>

    <div class="lean-header__center">
      <CenterIconNav className="lean-icon-nav" items={iconNavItems} />
    </div>

    <div class="lean-header__right">
      <div class="lean-status" aria-label="Player status">
        <div class="lean-status__level">
          <span class="lean-status__label">Level</span>
          <strong>{levelLabel}</strong>
        </div>
        <div class="lean-status__progress" aria-hidden={xpLabel === 'Aligning…'}>
          <div class="lean-status__bar"><span style={`width:${xpPct}%`}></span></div>
          <span class="lean-status__meta">{xpLabel}</span>
        </div>
        <div class="lean-status__metric pill is-static" aria-label="Energy">
          <span>⚡</span>
          <span>{energyLabel}</span>
        </div>
        <a
          class="lean-status__metric pill"
          data-testid="header-wallet-pill-lean"
          href="/app/wallet"
          aria-label="Shard balance"
          on:click={navWallet}
        >
          <span aria-hidden="true">💎</span>
          <span>{shardLabel}</span>
        </a>
      </div>

      <NotificationBell notifications={notifications} unreadCount={unreadCount} />

      <button type="button" class="lean-account pill" on:click={onLogout} aria-label={userEmail ? `Account menu for ${userEmail}` : 'Account menu'}>
        <span class="lean-account__initial" aria-hidden="true">{initials}</span>
        {#if userEmail}
          <span class="lean-account__email">{userEmail}</span>
        {/if}
      </button>
    </div>
  </div>
</header>

<style>
  .lean-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(11, 14, 19, 0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: env(safe-area-inset-top, 0px);
  }

  .lean-header__inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
    padding: 0 2.5rem;
    max-width: none;
    gap: 1rem;
  }

  .lean-header__left,
  .lean-header__right {
    display: inline-flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
  }

  .lean-logo {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    min-width: 0;
  }

  .lean-logo__mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.85), rgba(155, 92, 255, 0.85));
    box-shadow: 0 8px 18px rgba(94, 242, 255, 0.35);
  }

  .lean-logo__word {
    display: none;
    font-size: 0.82rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.78);
    font-weight: 600;
  }

  @media (min-width: 900px) {
    .lean-logo__word {
      display: inline;
    }
  }

  .lean-search {
    display: none;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.85rem;
    height: 2.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(22, 27, 40, 0.85);
    color: rgba(248, 250, 255, 0.75);
  }

  .lean-search input {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.85rem;
    width: 11.5rem;
  }

  .lean-search input::placeholder {
    color: rgba(248, 250, 255, 0.55);
  }

  .lean-search input:focus-visible {
    outline: none;
  }

  .lean-search:focus-within {
    border-color: rgba(94, 242, 255, 0.45);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.2);
  }

  .lean-search__icon {
    width: 16px;
    height: 16px;
    opacity: 0.65;
    fill: none;
  }

  .lean-header__center {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  :global(nav.lean-icon-nav) {
    pointer-events: auto;
  }

  :global(nav.lean-icon-nav > div) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    height: 2.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    backdrop-filter: blur(14px);
  }

  :global(nav.lean-icon-nav .brand-icon-button) {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    color: rgba(248, 250, 255, 0.75);
    border: 1px solid transparent;
    transition: background 150ms ease, color 150ms ease;
  }

  :global(nav.lean-icon-nav .brand-icon-button:hover),
  :global(nav.lean-icon-nav .brand-icon-button:focus-visible) {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }

  :global(nav.lean-icon-nav .brand-icon-button:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  :global(nav.lean-icon-nav .brand-icon-button.active) {
    color: #fff;
    background: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.35);
  }

  :global(:root) {
    --pill-h: 36px;
    --pill-px: 10px;
    --pill-bg: #0f141f;
    --pill-bg-hover: #161c29;
  }

  :global(.pill),
  .lean-status__metric,
  .lean-account,
  :global(.lean-header__right .notification-wrapper .bell) {
    height: var(--pill-h);
    padding: 0 var(--pill-px) !important;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    border-radius: 9999px;
    background: var(--pill-bg) !important;
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: background 150ms ease, border-color 150ms ease;
  }

  :global(.pill:hover),
  :global(.pill:focus-visible),
  .lean-status__metric:hover,
  .lean-status__metric:focus-visible,
  .lean-account:hover,
  .lean-account:focus-visible,
  :global(.lean-header__right .notification-wrapper .bell:hover),
  :global(.lean-header__right .notification-wrapper .bell:focus-visible) {
    background: var(--pill-bg-hover) !important;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .lean-status .pill {
    background: transparent !important;
    border-color: transparent;
    color: rgba(248, 250, 255, 0.75);
    box-shadow: none;
  }

  .lean-status .pill:hover,
  .lean-status .pill:focus-visible {
    background: rgba(255, 255, 255, 0.16) !important;
    border-color: transparent;
    color: #fff;
  }

  .lean-status {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 0 0 var(--pill-px);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(248, 250, 255, 0.85);
  }

  .lean-status__level {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .lean-status__label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(248, 250, 255, 0.6);
  }

  .lean-status__progress {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .lean-status__bar {
    width: 100px;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .lean-status__bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.9));
    transition: width 220ms ease;
  }

  .lean-status__meta {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: rgba(248, 250, 255, 0.6);
  }

  .lean-status__metric {
    gap: 0.45rem;
    font-size: 0.82rem;
    color: rgba(247, 249, 255, 0.9);
    cursor: pointer;
    text-decoration: none;
    position: relative;
    z-index: 1;
  }

  .lean-status__metric:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  .lean-status__metric span:first-child {
    font-size: 0.9rem;
  }

  .lean-status__metric.is-static {
    cursor: default;
    pointer-events: none;
    box-shadow: none;
  }

  :global(.lean-header__right .notification-wrapper) {
    position: relative;
  }

  :global(.lean-header__right .notification-wrapper .bell svg) {
    width: 18px;
    height: 18px;
  }

  .lean-account {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(248, 250, 255, 0.85);
    cursor: pointer;
  }

  .lean-account:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.4);
  }

  .lean-account__initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .lean-account__email {
    max-width: 180px;
    font-size: 0.75rem;
    color: rgba(248, 250, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (min-width: 768px) {
    .lean-search {
      display: inline-flex;
    }
  }

  @media (max-width: 768px) {
    .lean-header__inner {
      flex-direction: column;
      align-items: stretch;
      padding: 0.85rem 1rem 0.6rem;
    }

    .lean-header__left,
    .lean-header__right {
      width: 100%;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .lean-header__center {
      position: static;
      transform: none;
      width: 100%;
      order: 3;
      display: block;
      pointer-events: auto;
      padding-top: 0.5rem;
    }

    :global(nav.lean-icon-nav) {
      width: 100%;
    }

    :global(nav.lean-icon-nav > div) {
      width: 100%;
      justify-content: space-between;
      gap: 0.35rem;
    }

    .lean-status {
      width: 100%;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .lean-status__bar {
      width: 72px;
    }

    .lean-account__email {
      display: none;
    }

    .lean-logo__word {
      display: none !important;
    }

    .lean-search {
      display: flex;
      flex: 1;
      width: 100%;
    }
  }
</style>
